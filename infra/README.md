# Infrastructure

AWS CDK (TypeScript) stack for ROJAI. Deploys all cloud resources in a single stack.

## Resources Created

| Resource | Type | Purpose |
|----------|------|---------|
| `rojai-generator` | Lambda (Python 3.12, ARM64) | Handles listing generation requests |
| `rojai-api` | API Gateway HTTP API | Exposes POST /generate-listing |
| `/rojai/generator` | CloudWatch Log Group | Lambda logs (30-day retention) |
| IAM Role | Lambda execution role | bedrock:InvokeModel + CloudWatch Logs |

## CDK Context Parameters

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `bedrockModelId` | No | `anthropic.claude-3-sonnet-20240229-v1:0` | Bedrock model or inference profile ID |
| `allowedOrigins` | No | `http://localhost:5173` | Comma-separated CORS origins |

## Commands

```bash
npm ci
npx cdk synth   -c bedrockModelId=... -c "allowedOrigins=..."
npx cdk diff    -c bedrockModelId=... -c "allowedOrigins=..."
npx cdk deploy  -c bedrockModelId=... -c "allowedOrigins=..."
```

## Example Deploy

```bash
npx cdk deploy \
  -c bedrockModelId=us.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  -c "allowedOrigins=http://localhost:5173,https://develop.d1hu0f4tukm87q.amplifyapp.com"
```

## Stack Outputs

| Output | Description |
|--------|-------------|
| `ApiBaseUrl` | API Gateway invoke URL |
| `GenerateListingEndpoint` | Full POST endpoint URL |
| `LambdaFunctionName` | Lambda function name |
| `DeployedRegion` | AWS region |
| `BedrockModelId` | Configured model ID |

## Inference Profiles

Newer Claude models (4.x+) require inference profile IDs prefixed with `us.` or `global.`. The stack automatically detects these and generates the correct IAM ARNs for both the inference profile and the underlying foundation model.
