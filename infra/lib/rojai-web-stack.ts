import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwv2authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Construct } from "constructs";
import * as path from "path";

/**
 * RojAI Web Stack — standalone AI Listing website backend.
 *
 * Completely isolated from the Shopify Agent (RojAIStack + RojAIAgentStack).
 * Has its own Lambda, DynamoDB tables, Cognito User Pool, and API Gateway routes.
 *
 * Shares the same API Gateway instance by importing it (or creates its own).
 * For full isolation, this stack creates its own API Gateway.
 */
export interface RojAIWebStackProps extends cdk.StackProps {
  /** Bedrock model for website free-tier users. Default: us.amazon.nova-lite-v1:0 */
  bedrockModelId?: string;
}

export class RojAIWebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: RojAIWebStackProps) {
    super(scope, id, props);

    // ── Context values ──────────────────────────────────────────────────────
    const bedrockModelId: string =
      this.node.tryGetContext("webBedrockModelId") ??
      props?.bedrockModelId ??
      "us.amazon.nova-lite-v1:0";

    const allowedOriginsRaw: string =
      this.node.tryGetContext("webAllowedOrigins") ??
      "http://localhost:5173,https://develop.d1hu0f4tukm87q.amplifyapp.com";

    const allowedOrigins: string[] = allowedOriginsRaw
      .split(",")
      .map((o: string) => o.trim())
      .filter((o: string) => o.length > 0);

    // ── Amazon Cognito User Pool ────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, "WebUserPool", {
      userPoolName: "rojai-web-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient("WebSpaClient", {
      userPoolClientName: "rojai-web-spa",
      authFlows: {
        userSrp: true,
        custom: false,
        adminUserPassword: false,
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ── DynamoDB: Usage Table ────────────────────────────────────────────────
    const usageTable = new dynamodb.Table(this, "WebUsageTable", {
      tableName: "rojai-web-usage",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB: Requests Table (idempotency + regeneration) ────────────────
    const requestsTable = new dynamodb.Table(this, "WebRequestsTable", {
      tableName: "rojai-web-requests",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── DynamoDB: Rate Limits Table ─────────────────────────────────────────
    const rateLimitsTable = new dynamodb.Table(this, "WebRateLimitsTable", {
      tableName: "rojai-web-rate-limits",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── CloudWatch Log Group ────────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "WebHandlerLogGroup", {
      logGroupName: "/rojai/web-handler",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Website Lambda Function ─────────────────────────────────────────────
    const webFn = new lambda.Function(this, "WebHandlerFunction", {
      functionName: "rojai-web-handler",
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: "web_handler.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend"), {
        exclude: [
          ".venv", ".venv/**",
          "tests", "tests/**",
          "src", "src/**",
          "events", "events/**",
          ".pytest_cache", ".pytest_cache/**",
          "__pycache__", "**/__pycache__/**",
          "*.pyc",
          "local_server.py",
          ".env.example",
          "*.md",
          // Exclude Shopify agent modules (not needed for website)
          "agent", "agent/**",
        ],
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup,
      environment: {
        USE_MOCK_BEDROCK: "false",
        BEDROCK_MODEL_ID: bedrockModelId,
        BEDROCK_MAX_OUTPUT_TOKENS: "1500",
        ALLOWED_ORIGIN: allowedOrigins.join(","),
        USAGE_TABLE_NAME: usageTable.tableName,
        REQUESTS_TABLE_NAME: requestsTable.tableName,
        RATE_LIMITS_TABLE_NAME: rateLimitsTable.tableName,
        FREE_MONTHLY_LIMIT: "5",
        FREE_REGENERATION_LIMIT: "1",
        RATE_LIMIT_PER_MINUTE: "5",
        GENERATION_ENABLED: "true",
      },
    });

    // ── DynamoDB permissions ─────────────────────────────────────────────────
    usageTable.grantReadWriteData(webFn);
    requestsTable.grantReadWriteData(webFn);
    rateLimitsTable.grantReadWriteData(webFn);

    // ── Bedrock permission ──────────────────────────────────────────────────
    const isInferenceProfile =
      bedrockModelId.startsWith("us.") || bedrockModelId.startsWith("global.");

    const bedrockResources: string[] = [];
    if (isInferenceProfile) {
      bedrockResources.push(
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${bedrockModelId}`
      );
      const baseModelId = bedrockModelId.replace(/^(us|global)\./, "");
      bedrockResources.push(`arn:aws:bedrock:*::foundation-model/${baseModelId}`);
    } else {
      bedrockResources.push(
        `arn:aws:bedrock:${this.region}::foundation-model/${bedrockModelId}`
      );
    }

    webFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "AllowBedrockInvokeModel",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: bedrockResources,
      })
    );

    // ── API Gateway HTTP API ────────────────────────────────────────────────
    const webApi = new apigwv2.HttpApi(this, "WebApi", {
      apiName: "rojai-web-api",
      description: "RojAI standalone website API (Cognito-authenticated)",
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // ── JWT Authorizer ──────────────────────────────────────────────────────
    const jwtAuthorizer = new apigwv2authorizers.HttpJwtAuthorizer(
      "WebCognitoAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
        identitySource: ["$request.header.Authorization"],
      },
    );

    // ── Throttling ──────────────────────────────────────────────────────────
    const cfnStage = webApi.defaultStage!.node.defaultChild as cdk.aws_apigatewayv2.CfnStage;
    cfnStage.defaultRouteSettings = {
      throttlingBurstLimit: 10,
      throttlingRateLimit: 5,
    };

    // ── Routes (all Cognito-protected) ──────────────────────────────────────
    const webIntegration = new apigwv2integrations.HttpLambdaIntegration(
      "WebHandlerIntegration",
      webFn
    );

    webApi.addRoutes({
      path: "/web/generate-listing",
      methods: [apigwv2.HttpMethod.POST],
      integration: webIntegration,
      authorizer: jwtAuthorizer,
    });

    webApi.addRoutes({
      path: "/web/usage",
      methods: [apigwv2.HttpMethod.GET],
      integration: webIntegration,
      authorizer: jwtAuthorizer,
    });

    // ── Stack Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "WebApiBaseUrl", {
      description: "Website API Gateway base URL",
      value: webApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, "WebCognitoUserPoolId", {
      description: "Website Cognito User Pool ID",
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "WebCognitoClientId", {
      description: "Website Cognito Client ID (for Amplify frontend)",
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "WebLambdaFunctionName", {
      description: "Website Lambda function name",
      value: webFn.functionName,
    });
  }
}
