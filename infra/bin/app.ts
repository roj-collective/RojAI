import * as cdk from "aws-cdk-lib";
import { RojAIStack } from "../lib/rojAI-stack";

const app = new cdk.App();
new RojAIStack(app, "RojAIStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
