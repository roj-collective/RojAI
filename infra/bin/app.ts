import * as cdk from "aws-cdk-lib";
import { RojAIStack } from "../lib/rojAI-stack";
import { RojAIAgentStack } from "../lib/rojai-agent-stack";
import { RojAIWebStack } from "../lib/rojai-web-stack";

const app = new cdk.App();

// Existing listing generator stack (Shopify Agent — DO NOT MODIFY)
new RojAIStack(app, "RojAIStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Autonomous merchandising agent stack (Shopify — DO NOT MODIFY)
new RojAIAgentStack(app, "RojAIAgentStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Standalone website stack (Amplify frontend — isolated from Shopify)
new RojAIWebStack(app, "RojAIWebStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
