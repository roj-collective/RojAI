# RojAI

AI-powered product listing quality agent for Shopify merchants. RojAI audits product listings in real time, scores them on a 0-100 scale, and generates AI-driven recommendations to improve SEO, content completeness, and conversion readiness.

## Features

- **Product Quality Dashboard** — Real-time scoring of all store products with filtering by status and quality tier
- **Deterministic Quality Scoring** — Rule-based 0-100 scoring system evaluating title, description, tags, images, SEO metadata, vendor, and status
- **AI-Powered Recommendations** — Amazon Bedrock generates concrete improvement suggestions for underperforming listings
- **Autonomous Agent** — Scheduled background agent audits the entire catalog and produces recommendations without manual intervention
- **Read-Only by Design** — Only `read_products` scope; never modifies store data
- **Shopify Embedded App** — Runs natively inside Shopify admin as a fully integrated experience
- **Production Hardened** — API key authentication, Secrets Manager integration, CloudWatch alarms, structured logging

## Architecture

```mermaid
graph TB
    subgraph Shopify
        SA[Shopify Admin]
        API[Shopify GraphQL API]
    end

    subgraph Render
        APP[Shopify App<br/>React Router + Prisma]
        DB[(PostgreSQL)]
    end

    subgraph AWS
        APIGW[API Gateway]
        LG[Lambda<br/>Listing Generator]
        LA[Lambda<br/>Agent Handler]
        BR[Amazon Bedrock<br/>Claude / Nova]
        EB[EventBridge<br/>Daily Schedule]
        SM[Secrets Manager]
        CW[CloudWatch]
        DDB[(DynamoDB<br/>Agent Results)]
        SQS[SQS Dead Letter Queue]
    end

    SA -->|iframe| APP
    APP -->|OAuth + GraphQL| API
    APP -->|HTTPS| APIGW
    APIGW --> LG
    LG --> BR
    EB -->|cron| LA
    LA --> BR
    LA --> DDB
    LA --> SQS
    LG --> SM
    LA --> SM
    LG --> CW
    LA --> CW
    APP --> DB
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, React Router, Shopify App Bridge, Shopify Polaris Web Components |
| App Server | Node.js 20, React Router (SSR), Prisma ORM |
| Database | PostgreSQL 16 (Render managed) |
| Backend API | Python 3.12, AWS Lambda, API Gateway (HTTP API) |
| AI/ML | Amazon Bedrock (Claude Sonnet, Nova Lite) |
| Infrastructure | AWS CDK (TypeScript), Render Blueprint |
| Scheduling | Amazon EventBridge |
| Secrets | AWS Secrets Manager |
| Monitoring | CloudWatch Logs + Alarms |
| CI/CD | GitHub, Render auto-deploy |

## System Architecture

### Shopify App (Render)

The embedded Shopify app handles merchant-facing interactions:

- **Authentication** — Shopify OAuth with session persistence in PostgreSQL
- **Quality Dashboard** — Fetches products via Shopify GraphQL, scores them client-side using a deterministic evaluator aligned with the backend scoring rules
- **Listing Generation** — Sends underperforming products to the AWS backend for AI-powered improvement suggestions

### Backend API (AWS Lambda)

The listing generation endpoint accepts a product payload and returns AI-generated title, description, bullet points, and SEO keywords:

- Validated request schema with strict field constraints
- CORS-aware with configurable allowed origins
- Mock mode for local development (no AWS credentials needed)
- HMAC-based API key authentication in production

### Autonomous Agent (AWS Lambda + EventBridge)

The agent runs on a daily schedule and:

1. Retrieves the product catalog
2. Scores each product using the backend evaluator
3. Generates AI recommendations for products below the quality threshold (default: 80/100)
4. Stores results in DynamoDB
5. Reports metrics to CloudWatch

### Quality Scoring

Both frontend and backend implement identical scoring rules:

| Criterion | Max Points |
|-----------|-----------|
| Title length & quality | 20 |
| Description completeness | 20 |
| Tags (minimum 5) | 15 |
| Images (minimum 3) | 15 |
| SEO title | 8 |
| SEO description | 7 |
| Vendor present | 5 |
| Product type/category | 5 |
| Listing status (ACTIVE) | 5 |
| **Total** | **100** |

Products scoring below 70 are flagged as needing attention in the dashboard.

## Screenshots

<!-- Replace these placeholders with actual screenshots -->

| Dashboard Overview | Product Detail |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Product Detail](docs/screenshots/product-detail.png) |

| Quality Filters | Score Breakdown |
|---|---|
| ![Filters](docs/screenshots/filters.png) | ![Score](docs/screenshots/score-breakdown.png) |

## Deployment Architecture

```
                    Internet
                       |
        +--------------+--------------+
        |                             |
   Shopify Admin                  Render
   (iframe host)              (Docker container)
        |                             |
        +--- OAuth/GraphQL -----------+
                                      |
                              PostgreSQL (Render)
                                      |
                              HTTPS to AWS
                                      |
                           API Gateway (us-east-1)
                                      |
                        +-------------+-------------+
                        |                           |
                  Lambda (Generator)          Lambda (Agent)
                        |                           |
                  Amazon Bedrock              DynamoDB + Bedrock
```

**Render** hosts the Shopify app container and PostgreSQL database. **AWS** hosts the AI backend, agent orchestration, and all infrastructure. The two communicate over HTTPS with API key authentication.

## Local Development

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker (for local PostgreSQL)
- Shopify CLI (`npm install -g @shopify/cli`)
- AWS CDK CLI (`npm install -g aws-cdk`) — for infrastructure changes only

### Environment Variables

Copy the example files and configure:

```bash
# Shopify app
cp shopify-app/.env.example shopify-app/.env

# Backend
cp backend/.env.example backend/.env
```

#### Shopify App (`shopify-app/.env`)

```env
DATABASE_URL="postgresql://rojai:rojai_dev@localhost:5432/rojai_dev"
ROJAI_API_URL=
ROJAI_API_KEY=
```

> Shopify credentials (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`) are injected automatically by `shopify app dev`.

#### Backend (`backend/.env`)

```env
USE_MOCK_BEDROCK=true
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
AWS_REGION=us-east-1
ALLOWED_ORIGIN=http://localhost:5173
```

### Installation

```bash
# Clone the repository
git clone https://github.com/roj-collective/RojAI.git
cd RojAI

# Shopify app dependencies
cd shopify-app
npm install
npx prisma generate
cd ..

# Backend dependencies (optional — for running Lambda locally)
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Infrastructure dependencies (optional — for CDK changes)
cd infra
npm install
cd ..
```

### Running Locally

```bash
# Start local PostgreSQL
cd shopify-app
docker compose up -d

# Apply database migrations
npx prisma migrate deploy

# Start the Shopify app (opens tunnel + dev server)
shopify app dev
```

The Shopify CLI starts a development tunnel and opens the app in your dev store admin.

To run the backend API locally:

```bash
cd backend
python local_server.py
```

### Testing

```bash
# Shopify app tests
cd shopify-app
npm test

# Backend tests
cd backend
pytest

# Infrastructure tests
cd infra
npm test

# CDK synthesis (validates templates)
npx cdk synth
```

## Project Structure

```
RojAI/
+-- shopify-app/              # Shopify embedded app (Render deployment)
|   +-- app/
|   |   +-- routes/           # React Router routes
|   |   |   +-- app._index.tsx    # Quality dashboard
|   |   |   +-- app.products.$id.tsx  # Product detail
|   |   |   +-- app.tsx           # Authenticated layout
|   |   |   +-- auth.*.tsx        # OAuth routes
|   |   |   +-- health.tsx        # Health check endpoint
|   |   +-- components/       # UI components (MetricCard, ProductCard, FilterBar, etc.)
|   |   +-- lib/              # Quality scorer, session storage
|   |   +-- shopify.server.ts # Shopify auth configuration
|   +-- prisma/               # Database schema & migrations
|   +-- Dockerfile            # Production container
|   +-- render.yaml           # Render Blueprint
|   +-- shopify.app.toml      # Shopify app configuration
+-- backend/                  # AWS Lambda backend
|   +-- app.py                # Listing generator Lambda handler
|   +-- bedrock_service.py    # Bedrock API integration
|   +-- mock_service.py       # Mock mode for local dev
|   +-- validator.py          # Request validation
|   +-- prompt_builder.py     # AI prompt construction
|   +-- agent/                # Autonomous agent
|   |   +-- orchestrator.py   # Agent orchestration
|   |   +-- evaluator.py      # Product quality scorer
|   |   +-- recommender.py    # AI recommendation generator
|   |   +-- handler.py        # Lambda entry point
|   |   +-- schemas.py        # Domain models
|   +-- tests/                # Backend test suite
+-- infra/                    # AWS CDK infrastructure
|   +-- lib/
|   |   +-- rojAI-stack.ts        # Listing generator stack
|   |   +-- rojai-agent-stack.ts  # Agent stack
|   +-- bin/                  # CDK app entry point
+-- frontend/                 # Legacy standalone frontend (deprecated)
+-- docs/                     # Design documents & specs
```

## Roadmap

- [x] Product quality scoring (0-100)
- [x] Quality dashboard with filtering
- [x] AI-powered listing recommendations (Bedrock)
- [x] Autonomous scheduled agent
- [x] Shopify embedded app with OAuth
- [x] Production deployment (Render + AWS)
- [x] API key authentication
- [x] CloudWatch monitoring & alarms
- [ ] Product detail view with recommendation display
- [ ] One-click recommendation acceptance (write scope, future phase)
- [ ] Multi-store / multi-tenant support
- [ ] Bulk operations for catalog-wide improvements
- [ ] Historical score tracking and trend charts
- [ ] Webhook-driven scoring on product update
- [ ] Shopify App Store listing

## Security Considerations

- **Read-only scope** — The app only requests `read_products`. It cannot modify store data.
- **API authentication** — Backend requires HMAC-verified API key stored in AWS Secrets Manager.
- **No secrets in code** — All credentials are managed via environment variables and Secrets Manager.
- **Session isolation** — Prisma-backed sessions with per-shop authentication.
- **Fail-closed auth** — Missing or invalid API keys result in 503/401; bypass requires impossible dual-flag condition.
- **CORS enforcement** — Backend validates request origin against configured allowlist.
- **Least-privilege IAM** — Lambda roles have minimal permissions scoped to specific resources.
- **Encrypted at rest** — DynamoDB, Secrets Manager, and RDS PostgreSQL use AWS/Render encryption defaults.

## Future Work

- **Unified scoring** — Consolidate TypeScript frontend scorer and Python backend scorer into a single API-served score to eliminate drift risk.
- **Write operations** — Add `write_products` scope for one-click application of AI recommendations (requires merchant approval flow).
- **Multi-marketplace** — Extend beyond Shopify to Amazon, Etsy, and other marketplaces.
- **Custom scoring rules** — Allow merchants to configure scoring weights for their category.
- **A/B testing** — Track conversion impact of AI-recommended listing changes.

## License

MIT

---

Built by [Roj Collective](https://github.com/roj-collective)
