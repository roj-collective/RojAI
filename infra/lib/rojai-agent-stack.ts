import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";

/**
 * RojAI Agent Stack — autonomous merchandising agent.
 *
 * Deploys:
 * - Lambda function (agent handler)
 * - EventBridge rule (daily schedule)
 * - SQS dead-letter queue (failed invocations)
 * - CloudWatch log group
 * - Least-privilege IAM for Bedrock
 *
 * Completely isolated from the existing RojAIStack (listing generator).
 */

export interface RojAIAgentStackProps extends cdk.StackProps {
  /** Bedrock model/inference profile ID. Default: us.amazon.nova-lite-v1:0 */
  agentModelId?: string;
  /** Quality threshold (0-100). Default: 80 */
  qualityThreshold?: number;
  /** EventBridge schedule expression. Default: cron(0 13 * * ? *) = 13:00 UTC daily */
  scheduleExpression?: string;
  /** Whether the schedule is enabled. Default: true */
  scheduleEnabled?: boolean;
  /** Name of the Secrets Manager secret containing Shopify credentials. Default: rojai/shopify */
  shopifySecretName?: string;
}

export class RojAIAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: RojAIAgentStackProps) {
    super(scope, id, props);

    // ── Context / props resolution ─────────────────────────────────────────
    const agentModelId: string =
      this.node.tryGetContext("agentModelId") ??
      props?.agentModelId ??
      "us.amazon.nova-lite-v1:0";

    const qualityThreshold: number =
      Number(this.node.tryGetContext("agentQualityThreshold")) ||
      (props?.qualityThreshold ?? 80);

    const scheduleExpression: string =
      this.node.tryGetContext("agentSchedule") ??
      props?.scheduleExpression ??
      "cron(0 13 * * ? *)"; // 13:00 UTC daily

    const scheduleEnabled: boolean =
      (this.node.tryGetContext("agentScheduleEnabled") ?? "true") !== "false" &&
      (props?.scheduleEnabled !== false);

    const shopifySecretName: string =
      this.node.tryGetContext("shopifySecretName") ??
      props?.shopifySecretName ??
      "rojai/shopify";

    // ── Shopify Secrets Manager secret ─────────────────────────────────────
    const shopifySecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "ShopifySecret",
      shopifySecretName
    );

    // ── CloudWatch log group ───────────────────────────────────────────────
    const logGroup = new logs.LogGroup(this, "AgentLogGroup", {
      logGroupName: "/rojai/agent",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Dead-letter queue for failed schedule invocations ───────────────────
    const dlq = new sqs.Queue(this, "AgentDLQ", {
      queueName: "rojai-agent-dlq",
      retentionPeriod: cdk.Duration.days(7),
    });

    // ── DynamoDB table for recommendation history ──────────────────────────
    const recommendationsTable = new dynamodb.Table(this, "RecommendationsTable", {
      tableName: "rojai-agent-recommendations",
      partitionKey: { name: "product_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "run_timestamp", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: "ttl",
    });

    // ── Lambda function ────────────────────────────────────────────────────
    const agentFn = new lambda.Function(this, "AgentFunction", {
      functionName: "rojai-agent",
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: "agent.handler.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../backend"), {
        exclude: [
          ".venv",
          ".venv/**",
          ".pytest_cache",
          ".pytest_cache/**",
          "__pycache__",
          "**/__pycache__/**",
          "*.pyc",
          "tests",
          "tests/**",
          "agent/tests",
          "agent/tests/**",
          "events",
          "events/**",
          "src",
          "src/**",
          "local_server.py",
          ".env.example",
          "*.md",
          // Website-only modules (not used by the agent)
          "web_handler.py",
          "usage_service.py",
          "rate_limiter.py",
        ],
      }),
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      logGroup,
      environment: {
        AGENT_QUALITY_THRESHOLD: String(qualityThreshold),
        BEDROCK_MODEL_ID: agentModelId,
        SHOPIFY_SECRET_NAME: shopifySecretName,
        STORE_PROVIDER: "shopify",
        RECOMMENDATIONS_TABLE_NAME: recommendationsTable.tableName,
        // AWS_REGION is injected automatically by the Lambda runtime
      },
    });

    // ── Secrets Manager read permission ────────────────────────────────────
    shopifySecret.grantRead(agentFn);

    // ── DynamoDB read/write permission ─────────────────────────────────────
    recommendationsTable.grantReadWriteData(agentFn);

    // ── Bedrock IAM permission ─────────────────────────────────────────────
    const isInferenceProfile =
      agentModelId.startsWith("us.") || agentModelId.startsWith("global.");

    const bedrockResources: string[] = [];
    if (isInferenceProfile) {
      bedrockResources.push(
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${agentModelId}`
      );
      const baseModelId = agentModelId.replace(/^(us|global)\./, "");
      bedrockResources.push(
        `arn:aws:bedrock:*::foundation-model/${baseModelId}`
      );
    } else {
      bedrockResources.push(
        `arn:aws:bedrock:${this.region}::foundation-model/${agentModelId}`
      );
    }

    agentFn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "AllowBedrockInvokeModel",
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: bedrockResources,
      })
    );

    // ── EventBridge daily schedule ─────────────────────────────────────────
    const rule = new events.Rule(this, "AgentScheduleRule", {
      ruleName: "rojai-agent-daily",
      description: "Triggers the RojAI merchandising agent daily at 13:00 UTC",
      schedule: events.Schedule.expression(scheduleExpression),
      enabled: scheduleEnabled,
    });

    rule.addTarget(
      new targets.LambdaFunction(agentFn, {
        retryAttempts: 2,
        maxEventAge: cdk.Duration.hours(1),
        deadLetterQueue: dlq,
      })
    );

    // ── Stack outputs ──────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "AgentFunctionName", {
      description: "Agent Lambda function name",
      value: agentFn.functionName,
    });

    new cdk.CfnOutput(this, "AgentScheduleName", {
      description: "EventBridge rule name",
      value: rule.ruleName!,
    });

    new cdk.CfnOutput(this, "AgentScheduleExpression", {
      description: "Schedule expression (default: daily at 13:00 UTC)",
      value: scheduleExpression,
    });

    new cdk.CfnOutput(this, "AgentLogGroupName", {
      description: "CloudWatch log group",
      value: logGroup.logGroupName!,
    });

    new cdk.CfnOutput(this, "AgentDLQUrl", {
      description: "Dead-letter queue URL for failed invocations",
      value: dlq.queueUrl,
    });

    new cdk.CfnOutput(this, "AgentModelId", {
      description: "Configured Bedrock model ID",
      value: agentModelId,
    });

    new cdk.CfnOutput(this, "RecommendationsTableName", {
      description: "DynamoDB table for recommendation history",
      value: recommendationsTable.tableName,
    });
  }
}
