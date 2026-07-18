import * as cdk from "aws-cdk-lib";
import { RojAIStack } from "../lib/rojAI-stack";
import { RojAIAgentStack } from "../lib/rojai-agent-stack";

const app = new cdk.App();

// Existing listing generator stack
new RojAIStack(app, "RojAIStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Autonomous merchandising agent stack (AWS Weekend Agent Challenge)
new RojAIAgentStack(app, "RojAIAgentStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
