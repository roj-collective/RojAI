# RojAI

> AI-powered marketplace listing generator — built with AWS serverless.

RojAI helps online sellers create optimised product listings (titles, bullet points, descriptions, SEO keywords, and tags) using generative AI via Amazon Bedrock.

## Architecture

```
React + Vite → API Gateway HTTP API → Lambda (Python 3.12) → Amazon Bedrock (Claude 3 Sonnet)
```

## Project Structure

```
backend/        Python Lambda handler, validation, prompt builder, mock + Bedrock services
frontend/       React + TypeScript + Vite SPA
infra/          AWS CDK (TypeScript) — deploys Lambda, API Gateway, IAM, CloudWatch
prompts/        Prompt template files
amplify.yml     AWS Amplify Hosting build configuration
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.12 (or 3.9+ for local testing)
- AWS CLI configured (only needed for `cdk deploy`)

### Backend (Terminal 1)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run tests
python -m pytest tests/test_app.py -v

# Start local server (mock mode — no AWS credentials needed)
USE_MOCK_BEDROCK=true python local_server.py
# Runs on http://localhost:8000
```

### Frontend (Terminal 2)

```bash
cd frontend
npm ci

# Create local env (git-ignored)
cp .env.example .env.local
# Edit .env.local and set:
#   VITE_API_BASE_URL=http://localhost:8000

npm run dev
# Runs on http://localhost:5173
```

Open http://localhost:5173, fill the form, click Generate.

---

## AWS Deployment

### Deploy Backend (CDK)

```bash
aws sts get-caller-identity   # Confirm your identity
cd infra
npm ci
npx cdk bootstrap             # First time only
npx cdk synth \
  -c bedrockModelId=anthropic.claude-3-sonnet-20240229-v1:0 \
  -c "allowedOrigins=http://localhost:5173"
npx cdk deploy \
  -c bedrockModelId=anthropic.claude-3-sonnet-20240229-v1:0 \
  -c "allowedOrigins=http://localhost:5173"
```

After deploy, note the `ApiBaseUrl` output (e.g. `https://xxx.execute-api.us-east-1.amazonaws.com`).

### Deploy Frontend (AWS Amplify Hosting)

1. Go to **AWS Amplify** → **Host web app** → **GitHub**
2. Connect repository: `roj-collective/RojAI`
3. Select branch: `develop`
4. Amplify auto-detects `amplify.yml` in the repo root
5. Add environment variable in Amplify Console:
   - Key: `VITE_API_BASE_URL`
   - Value: `https://myuoz8ymfb.execute-api.us-east-1.amazonaws.com` (your API base URL)
6. Deploy

After Amplify deployment completes, note the Amplify URL (e.g. `https://develop.d1abc123.amplifyapp.com`).

### Update CORS for Production

Once you have the Amplify URL, redeploy CDK with both origins:

```bash
cd infra
npx cdk deploy \
  -c bedrockModelId=anthropic.claude-3-sonnet-20240229-v1:0 \
  -c "allowedOrigins=http://localhost:5173,https://develop.d1abc123.amplifyapp.com"
```

---

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API base URL (no trailing slash) |

### Backend (Lambda / local)

| Variable | Description |
|---|---|
| `USE_MOCK_BEDROCK` | `"true"` for mock, `"false"` for real Bedrock |
| `BEDROCK_MODEL_ID` | Bedrock model ID |
| `ALLOWED_ORIGIN` | Comma-separated CORS origins |

### CDK Context

| Key | Description |
|---|---|
| `bedrockModelId` | Foundation model ID |
| `allowedOrigins` | Comma-separated allowed CORS origins |

---

## Bedrock Model Access

Before the Lambda can call Bedrock, enable model access:
1. AWS Console → Amazon Bedrock → Model access
2. Request access for Anthropic → Claude 3 Sonnet
3. Wait for "Access granted" status

---

## License

Private repository © ROJ Collective
