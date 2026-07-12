# ROJAI

AI-powered product listing generator for online sellers.

ROJAI turns a product name and a short description into a complete marketplace-ready listing — title, bullet points, full description, SEO keywords, and tags — in seconds. Powered by Amazon Bedrock (Claude) and deployed entirely on AWS serverless infrastructure.

**Live:** [develop.d1hu0f4tukm87q.amplifyapp.com](https://develop.d1hu0f4tukm87q.amplifyapp.com)

---

## Architecture

```
Browser (React + Vite)
    │  POST /generate-listing
    ▼
API Gateway HTTP API
    │
    ▼
AWS Lambda (Python 3.12)
    │
    ▼
Amazon Bedrock (Claude Sonnet 4.5)
    │
    ▼
Structured JSON listing returned to browser
```

## Repository Structure

```
backend/       Lambda handler, validation, Bedrock integration, mock service
frontend/      React + TypeScript + Vite single-page application
infra/         AWS CDK (TypeScript) — all cloud resources in one stack
prompts/       Prompt template files (reference only)
amplify.yml    AWS Amplify Hosting build spec
```

---

## Quick Start (Local)

### Prerequisites

- Node.js 18+
- Python 3.9+
- No AWS credentials needed for local development

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
USE_MOCK_BEDROCK=true python local_server.py
```

Runs on `http://localhost:8000`. Mock mode returns realistic structured data without calling AWS.

### 2. Frontend

```bash
cd frontend
npm ci
cp .env.example .env.local   # sets VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Runs on `http://localhost:5173`. Open it and click Generate.

---

## Deployment

### Backend (CDK)

```bash
cd infra
npm ci
npx cdk bootstrap                            # first time only
npx cdk deploy \
  -c bedrockModelId=us.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  -c "allowedOrigins=http://localhost:5173,https://YOUR-AMPLIFY-URL"
```

Outputs the API Gateway URL after deploy.

### Frontend (Amplify Hosting)

1. AWS Amplify Console → Host web app → GitHub → `roj-collective/RojAI` → branch `develop`
2. Set environment variable: `VITE_API_BASE_URL` = your API Gateway URL
3. Deploy — Amplify uses `amplify.yml` automatically

### After Amplify Deploy

Update CORS with the real Amplify URL:

```bash
cd infra
npx cdk deploy \
  -c bedrockModelId=us.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  -c "allowedOrigins=http://localhost:5173,https://develop.YOUR-ID.amplifyapp.com"
```

---

## Environment Variables

| Layer | Variable | Purpose |
|-------|----------|---------|
| Frontend | `VITE_API_BASE_URL` | API Gateway base URL |
| Backend | `USE_MOCK_BEDROCK` | `true` = local mock, `false` = real Bedrock |
| Backend | `BEDROCK_MODEL_ID` | Inference profile or model ID |
| Backend | `ALLOWED_ORIGIN` | Comma-separated CORS origins |
| CDK | `bedrockModelId` | Passed via `-c` context |
| CDK | `allowedOrigins` | Passed via `-c` context |

---

## Bedrock Model Access

Before the Lambda can call Bedrock in production:

1. AWS Console → Amazon Bedrock → Model access
2. Enable access for the configured model (e.g. Anthropic Claude Sonnet 4.5)
3. Wait for "Access granted"

Newer Claude models (4.x+) require **inference profile IDs** (prefixed `us.` or `global.`) rather than bare model IDs. The CDK stack handles this automatically.

---

## Testing

```bash
# Backend
cd backend && source .venv/bin/activate && python -m pytest tests/ -v

# Frontend
cd frontend && npm run build
```

---

## License

Private repository © ROJ Collective
