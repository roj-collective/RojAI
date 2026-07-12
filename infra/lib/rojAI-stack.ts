import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Construct } from "constructs";
import * as path from "path";

export class RojAIStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Context values (pass with -c key=value) ────────────────────────────
    // Required: npx cdk deploy -c bedrockModelId=anthropic.claude-3-sonnet-20240229-v1:0
    const bedrockModelId: string =
      this.node.tryGetContext("bedrockModelId") ??
      "anthropic.claude-3-sonnet-20240229-v1:0";

    // Allow CORS from local frontend during dev; override for production deploy.
    // Pass a comma-separated list for multiple origins:
    //   -c allowedOrigins="http://localhost:5173,https://develop.xyz.amplifyapp.com"
    const allowedOriginsRaw: string =
      this.node.tryGetContext("allowedOrigins") ??
      this.node.tryGetContext("allowedOrigin") ??
      "http://localhost:5173";

    const allowedOrigins: string[] = allowedOriginsRaw
      .split(",")
      .map((o: string) => o.trim())
      .filter((o: string) => o.length > 0);

    // ── CloudWatch log group ───────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "GeneratorLogGroup", {
      logGroupName: "/rojai/generator",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Lambda function ────────────────────────────────────────────────────
    // Handler: app.handler  (backend/app.py → def handler)
    // Asset:   backend/ root, production modules only
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
        ALLOWED_ORIGIN: allowedOrigins.join(","),
        // AWS_REGION is injected automatically by the Lambda runtime
      },
    });

    // ── Bedrock permission ─────────────────────────────────────────────────
    // Scope to the exact model ARN in the deployed region
    const bedrockModelArn = `arn:aws:bedrock:${this.region}::foundation-model/${bedrockModelId}`;

    generatorFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "AllowBedrockInvokeModel",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [bedrockModelArn],
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
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // POST /generate-listing
    httpApi.addRoutes({
      path: "/generate-listing",
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2integrations.HttpLambdaIntegration(
        "GeneratorIntegration",
        generatorFn
      ),
    });

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
  }
}
