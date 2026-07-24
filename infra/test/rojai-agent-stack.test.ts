import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { RojAIAgentStack } from "../lib/rojai-agent-stack";
import { RojAIStack } from "../lib/rojAI-stack";

describe("RojAIAgentStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App({
      context: {
        agentModelId: "us.amazon.nova-lite-v1:0",
      },
    });
    const stack = new RojAIAgentStack(app, "TestAgentStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    template = Template.fromStack(stack);
  });

  // ── Lambda function ─────────────────────────────────────────────────────

  test("Agent Lambda function exists", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "rojai-agent",
    });
  });

  test("Handler is agent.handler.handler", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "agent.handler.handler",
    });
  });

  test("Runtime is Python 3.12", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.12",
    });
  });

  test("Architecture is ARM64", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Architectures: ["arm64"],
    });
  });

  test("Memory is 512 MB", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      MemorySize: 512,
    });
  });

  test("Timeout is 120 seconds (2 minutes)", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Timeout: 120,
    });
  });

  test("Environment has AGENT_QUALITY_THRESHOLD", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          AGENT_QUALITY_THRESHOLD: "80",
        }),
      },
    });
  });

  test("Environment has BEDROCK_MODEL_ID", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          BEDROCK_MODEL_ID: "us.amazon.nova-lite-v1:0",
        }),
      },
    });
  });

  // ── Bedrock IAM permission ──────────────────────────────────────────────

  test("Bedrock InvokeModel permission is granted", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "bedrock:InvokeModel",
            Effect: "Allow",
            Sid: "AllowBedrockInvokeModel",
          }),
        ]),
      },
    });
  });

  // ── EventBridge schedule ────────────────────────────────────────────────

  test("EventBridge rule exists with daily schedule", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      Name: "rojai-agent-daily",
      ScheduleExpression: "cron(0 13 * * ? *)",
      State: "ENABLED",
    });
  });

  test("EventBridge rule targets the Lambda", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.anyValue(),
          RetryPolicy: Match.objectLike({
            MaximumRetryAttempts: 2,
          }),
        }),
      ]),
    });
  });

  test("Lambda invoke permission exists for EventBridge", () => {
    template.hasResourceProperties("AWS::Lambda::Permission", {
      Action: "lambda:InvokeFunction",
      Principal: "events.amazonaws.com",
    });
  });

  // ── Dead-letter queue ───────────────────────────────────────────────────

  test("SQS dead-letter queue exists", () => {
    template.hasResourceProperties("AWS::SQS::Queue", {
      QueueName: "rojai-agent-dlq",
      MessageRetentionPeriod: 604800, // 7 days in seconds
    });
  });

  test("EventBridge target references DLQ", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      Targets: Match.arrayWith([
        Match.objectLike({
          DeadLetterConfig: Match.objectLike({
            Arn: Match.anyValue(),
          }),
        }),
      ]),
    });
  });

  // ── CloudWatch log group ────────────────────────────────────────────────

  test("CloudWatch log group exists", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/rojai/agent",
      RetentionInDays: 14,
    });
  });

  // ── Schedule disabled configuration ─────────────────────────────────────

  test("Schedule can be disabled via props", () => {
    const app = new cdk.App();
    const stack = new RojAIAgentStack(app, "DisabledStack", {
      env: { account: "123456789012", region: "us-east-1" },
      scheduleEnabled: false,
    });
    const disabledTemplate = Template.fromStack(stack);

    disabledTemplate.hasResourceProperties("AWS::Events::Rule", {
      State: "DISABLED",
    });
  });

  test("Schedule can be disabled via context", () => {
    const app = new cdk.App({
      context: { agentScheduleEnabled: "false" },
    });
    const stack = new RojAIAgentStack(app, "DisabledCtxStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const disabledTemplate = Template.fromStack(stack);

    disabledTemplate.hasResourceProperties("AWS::Events::Rule", {
      State: "DISABLED",
    });
  });
});

// ── Existing RojAI resources remain unchanged ─────────────────────────────

describe("RojAIStack remains unchanged", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App({
      context: {
        bedrockModelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        allowedOrigins: "http://localhost:5173",
      },
    });
    const stack = new RojAIStack(app, "TestMainStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    template = Template.fromStack(stack);
  });

  test("Generator Lambda still exists", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "rojai-generator",
      Handler: "app.handler",
    });
  });

  test("API Gateway still exists", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      Name: "rojai-api",
    });
  });
});
