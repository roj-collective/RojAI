import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwv2authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Construct } from "constructs";
import * as path from "path";

export interface RojAIStackProps extends cdk.StackProps {
  /** Name of the Secrets Manager secret storing the API key. Default: rojai/api-key */
  apiKeySecretName?: string;
  /** Monthly budget limit in USD. Default: 25 */
  monthlyBudgetUsd?: number;
  /** Email for budget notifications. Required for budget alerts. */
  budgetNotificationEmail?: string;
}

export class RojAIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: RojAIStackProps) {
    super(scope, id, props);

    // ── Context values (pass with -c key=value) ────────────────────────────
    const bedrockModelId: string =
      this.node.tryGetContext("bedrockModelId") ??
      "anthropic.claude-3-sonnet-20240229-v1:0";

    const bedrockFreeModelId: string =
      this.node.tryGetContext("bedrockFreeModelId") ??
      "us.amazon.nova-lite-v1:0";

    const allowedOriginsRaw: string =
      this.node.tryGetContext("allowedOrigins") ??
      this.node.tryGetContext("allowedOrigin") ??
      "http://localhost:5173";

    const allowedOrigins: string[] = allowedOriginsRaw
      .split(",")
      .map((o: string) => o.trim())
      .filter((o: string) => o.length > 0);

    const apiKeySecretName: string =
      this.node.tryGetContext("apiKeySecretName") ??
      props?.apiKeySecretName ??
      "rojai/api-key";

    const monthlyBudgetUsd: number =
      Number(this.node.tryGetContext("monthlyBudgetUsd")) ||
      (props?.monthlyBudgetUsd ?? 25);

    const budgetNotificationEmail: string =
      this.node.tryGetContext("budgetNotificationEmail") ??
      props?.budgetNotificationEmail ??
      "";

    // ── Amazon Cognito User Pool ───────────────────────────────────────────
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "rojai-users",
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

    // SPA client (public — no client secret)
    const userPoolClient = userPool.addClient("WebClient", {
      userPoolClientName: "rojai-web",
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

    // ── DynamoDB: Usage Table ──────────────────────────────────────────────
    // One item per user per month: tracks generation count and plan info.
    const usageTable = new dynamodb.Table(this, "UsageTable", {
      tableName: "rojai-usage",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING }, // USER#{userId}
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },     // MONTH#{yyyy-MM}
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB: Requests Table ───────────────────────────────────────────
    // Tracks individual generation requests for idempotency and regeneration counts.
    // TTL removes old records automatically.
    const requestsTable = new dynamodb.Table(this, "RequestsTable", {
      tableName: "rojai-requests",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING }, // USER#{userId}
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },     // REQ#{idempotencyKey}
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── DynamoDB: Rate Limits Table ────────────────────────────────────────
    // Sliding-window rate limit entries with TTL for automatic cleanup.
    const rateLimitsTable = new dynamodb.Table(this, "RateLimitsTable", {
      tableName: "rojai-rate-limits",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING }, // USER#{userId}
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },     // TS#{timestamp_ms}
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── API Key Secret (Secrets Manager) ───────────────────────────────────
    const apiKeySecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "ApiKeySecret",
      apiKeySecretName,
    );

    // ── CloudWatch log group ───────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "GeneratorLogGroup", {
      logGroupName: "/rojai/generator",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Lambda function ────────────────────────────────────────────────────
    const generatorFn = new lambda.Function(this, "GeneratorFunction", {
      functionName: "rojai-generator",
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: "app.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend"), {
        exclude: [
          ".venv",
          ".venv/**",
          "tests",
          "tests/**",
          "src",
          "src/**",
          "events",
          "events/**",
          ".pytest_cache",
          ".pytest_cache/**",
          "__pycache__",
          "**/__pycache__/**",
          "*.pyc",
          "local_server.py",
          ".env.example",
          "*.md",
        ],
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup,
      environment: {
        USE_MOCK_BEDROCK: "false",
        BEDROCK_MODEL_ID: bedrockModelId,
        BEDROCK_FREE_MODEL_ID: bedrockFreeModelId,
        BEDROCK_MAX_OUTPUT_TOKENS: "1500",
        ALLOWED_ORIGIN: allowedOrigins.join(","),
        ROJAI_API_KEY_SECRET_NAME: apiKeySecretName,
        USAGE_TABLE_NAME: usageTable.tableName,
        REQUESTS_TABLE_NAME: requestsTable.tableName,
        RATE_LIMITS_TABLE_NAME: rateLimitsTable.tableName,
        FREE_MONTHLY_LIMIT: "5",
        FREE_REGENERATION_LIMIT: "1",
        RATE_LIMIT_PER_MINUTE: "5",
        GENERATION_ENABLED: "true",
        // AWS_REGION injected automatically by Lambda runtime
      },
    });

    // ── DynamoDB permissions ───────────────────────────────────────────────
    usageTable.grantReadWriteData(generatorFn);
    requestsTable.grantReadWriteData(generatorFn);
    rateLimitsTable.grantReadWriteData(generatorFn);

    // ── Secrets Manager read permission (API key only) ─────────────────────
    apiKeySecret.grantRead(generatorFn);

    // ── Bedrock permission ─────────────────────────────────────────────────
    const isInferenceProfile = bedrockModelId.startsWith("us.") || bedrockModelId.startsWith("global.");
    const isFreeInferenceProfile = bedrockFreeModelId.startsWith("us.") || bedrockFreeModelId.startsWith("global.");

    const bedrockResources: string[] = [];

    // Paid model
    if (isInferenceProfile) {
      bedrockResources.push(
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${bedrockModelId}`
      );
      const baseModelId = bedrockModelId.replace(/^(us|global)\./, "");
      bedrockResources.push(
        `arn:aws:bedrock:*::foundation-model/${baseModelId}`
      );
    } else {
      bedrockResources.push(
        `arn:aws:bedrock:${this.region}::foundation-model/${bedrockModelId}`
      );
    }

    // Free-tier model (if different)
    if (bedrockFreeModelId !== bedrockModelId) {
      if (isFreeInferenceProfile) {
        bedrockResources.push(
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${bedrockFreeModelId}`
        );
        const baseFreeModelId = bedrockFreeModelId.replace(/^(us|global)\./, "");
        bedrockResources.push(
          `arn:aws:bedrock:*::foundation-model/${baseFreeModelId}`
        );
      } else {
        bedrockResources.push(
          `arn:aws:bedrock:${this.region}::foundation-model/${bedrockFreeModelId}`
        );
      }
    }

    generatorFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "AllowBedrockInvokeModel",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: bedrockResources,
      })
    );

    // ── API Gateway HTTP API ───────────────────────────────────────────────
    const httpApi = new apigwv2.HttpApi(this, "GeneratorApi", {
      apiName: "rojai-api",
      description: "RojAI listing generation API",
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

    // ── API Gateway JWT Authorizer (Cognito) ───────────────────────────────
    const jwtAuthorizer = new apigwv2authorizers.HttpJwtAuthorizer(
      "CognitoAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
        identitySource: ["$request.header.Authorization"],
      },
    );

    // ── Two-stage migration ────────────────────────────────────────────────
    // Stage 1 (default): Deploy WITHOUT JWT protection on /generate-listing.
    //   This adds /internal/generate-listing for Shopify migration.
    // Stage 2 (-c enableCognitoAuth=true): Adds JWT authorizer to /generate-listing.
    //   Only after Shopify has been migrated to /internal/generate-listing.
    const enableCognitoAuth =
      (this.node.tryGetContext("enableCognitoAuth") ?? "false") === "true";

    // ── API Gateway Throttling ─────────────────────────────────────────────
    const cfnStage = httpApi.defaultStage!.node.defaultChild as cdk.aws_apigatewayv2.CfnStage;
    cfnStage.defaultRouteSettings = {
      throttlingBurstLimit: Number(this.node.tryGetContext("apiBurstLimit")) || 10,
      throttlingRateLimit: Number(this.node.tryGetContext("apiRateLimit")) || 5,
    };

    // POST /generate-listing
    // Stage 1: No authorizer (backward compatible — existing callers continue to work)
    // Stage 2: JWT authorizer (standalone website must send Cognito token)
    httpApi.addRoutes({
      path: "/generate-listing",
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2integrations.HttpLambdaIntegration(
        "GeneratorIntegration",
        generatorFn
      ),
      ...(enableCognitoAuth ? { authorizer: jwtAuthorizer } : {}),
    });

    // POST /internal/generate-listing (server-to-server — Shopify app uses Bearer API key)
    // No JWT authorizer: Lambda validates the API key in-process.
    httpApi.addRoutes({
      path: "/internal/generate-listing",
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2integrations.HttpLambdaIntegration(
        "InternalGeneratorIntegration",
        generatorFn
      ),
      // No authorizer — Lambda enforces API key auth
    });

    // GET /usage (authenticated — returns current usage for the user)
    httpApi.addRoutes({
      path: "/usage",
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2integrations.HttpLambdaIntegration(
        "UsageIntegration",
        generatorFn
      ),
      ...(enableCognitoAuth ? { authorizer: jwtAuthorizer } : {}),
    });

    // ── CloudWatch Alarms ──────────────────────────────────────────────────

    new cloudwatch.Alarm(this, "GeneratorErrorAlarm", {
      alarmName: "rojai-generator-errors",
      alarmDescription: "Lambda platform errors (crashes, timeouts, OOM)",
      metric: generatorFn.metricErrors({
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, "GeneratorDurationAlarm", {
      alarmName: "rojai-generator-duration",
      alarmDescription: "Generator Lambda duration exceeds 25 seconds",
      metric: generatorFn.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: "Maximum",
      }),
      threshold: 25_000,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const serverErrorMetricFilter = new logs.MetricFilter(this, "ServerErrorFilter", {
      logGroup,
      filterPattern: logs.FilterPattern.literal("?status=500 ?status=502 ?status=503"),
      metricNamespace: "RojAI/Generator",
      metricName: "ServerErrors",
      metricValue: "1",
      defaultValue: 0,
    });

    new cloudwatch.Alarm(this, "GeneratorServerErrorAlarm", {
      alarmName: "rojai-generator-5xx",
      alarmDescription: "Application-level 5xx responses (Bedrock failures, unexpected errors)",
      metric: serverErrorMetricFilter.metric({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ── AWS Budget ─────────────────────────────────────────────────────────
    if (budgetNotificationEmail) {
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: "rojai-monthly-budget",
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: {
            amount: monthlyBudgetUsd,
            unit: "USD",
          },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [
              {
                subscriptionType: "EMAIL",
                address: budgetNotificationEmail,
              },
            ],
          },
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [
              {
                subscriptionType: "EMAIL",
                address: budgetNotificationEmail,
              },
            ],
          },
        ],
      });
    }

    // ── Stack outputs ──────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "ApiBaseUrl", {
      description: "API Gateway base URL",
      value: httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, "GenerateListingEndpoint", {
      description: "POST endpoint for listing generation",
      value: `${httpApi.apiEndpoint}/generate-listing`,
    });

    new cdk.CfnOutput(this, "LambdaFunctionName", {
      description: "Generator Lambda function name",
      value: generatorFn.functionName,
    });

    new cdk.CfnOutput(this, "DeployedRegion", {
      description: "AWS region",
      value: this.region,
    });

    new cdk.CfnOutput(this, "BedrockModelId", {
      description: "Configured Bedrock model ID",
      value: bedrockModelId,
    });

    new cdk.CfnOutput(this, "CognitoUserPoolId", {
      description: "Cognito User Pool ID",
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "CognitoUserPoolClientId", {
      description: "Cognito User Pool Client ID (for frontend)",
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "UsageTableName", {
      description: "DynamoDB usage table name",
      value: usageTable.tableName,
    });
  }
}
