# RojAI Agent — Feature Specification (Revised)

## Overview

An autonomous ecommerce merchandising agent that runs on a schedule, audits a product catalog, generates AI-powered improvement recommendations via Amazon Bedrock, stores results in DynamoDB, and sends a daily email report via SES.

Built for the **AWS Weekend Agent Challenge**. The agent must demonstrate autonomous decision-making — running without human intervention and proactively improving product listings.

---

## Key Decisions

| Question | Answer |
|----------|--------|
| Does the app currently store products in DynamoDB? | **No.** The existing app is stateless — it generates listings on demand from user form input. There is no product catalog, no database, and no persistent storage. |
| How will the agent get products to audit? | **MockStoreProvider** — a hardcoded sample product catalog embedded in the agent code. This avoids building a full CRUD product management system for the challenge. |
| Primary trigger? | **EventBridge Scheduler** — runs daily in production. |
| Manual trigger? | **POST /agent/trigger** — development and demo only, not part of the autonomous flow. |
| Frontend dashboard? | **Optional.** The autonomous backend flow (schedule → audit → recommend → store → email) is the qualifying deliverable. The React dashboard is a bonus if time allows. |
| Marketplace integrations? | **None.** No Shopify, Etsy, or Amazon API connections. No OAuth. No billing. |
| Auto-apply recommendations? | **No.** The agent generates recommendations; it does not edit products automatically. |

---

## Functional Requirements (MVP)

### FR-1: Scheduled Autonomous Execution
The agent runs automatically once per day via EventBridge Scheduler without human intervention.

### FR-2: Product Catalog (Mock)
The agent reads products from a MockStoreProvider containing 5–10 realistic sample products representing an online store (e.g. handwoven textiles, home décor). Each product has a name, description, category, marketplace, and current listing fields.

### FR-3: Quality Evaluation
The agent evaluates each product's listing quality using a deterministic scoring rubric (no AI needed for scoring itself — just string-length checks, keyword presence, bullet count, etc.).

### FR-4: AI Recommendations
Products scoring below threshold (70/100) receive AI-generated improvement recommendations from Amazon Bedrock: better title, improved bullets, SEO keywords, and tags.

### FR-5: Persistent Results
All audit results and recommendations are stored in DynamoDB with run timestamps, enabling retrieval via API.

### FR-6: Daily Email Report
After each run, the agent sends a summary email via Amazon SES: products audited, issues found, top recommendations.

### FR-7: Manual Trigger (Dev/Demo only)
POST /agent/trigger allows running the agent on demand for testing and demonstrations.

---

## Architecture

```
EventBridge Scheduler (daily cron)
         │
         ▼
┌──────────────────────────────────────┐
│         Agent Lambda                  │
│  (Python 3.12, ARM64, 5 min, 1 GB)  │
│                                      │
│  1. Load products (MockStoreProvider)│
│  2. Score each product (evaluator)   │
│  3. Call Bedrock for low-scorers     │
│  4. Write results → DynamoDB         │
│  5. Send report → SES                │
└──────────────────────────────────────┘
      │           │           │
      ▼           ▼           ▼
┌──────────┐ ┌────────┐ ┌────────┐
│ DynamoDB │ │Bedrock │ │  SES   │
│ (results)│ │Claude  │ │ Email  │
└──────────┘ └────────┘ └────────┘
      │
      ▼
┌──────────────────────────────────┐
│  API Gateway (existing)          │
│  + GET /agent/recommendations    │
│  + GET /agent/history            │
│  + POST /agent/trigger           │
└──────────────────────────────────┘
```

---

## AWS Services (MVP)

| Service | Purpose |
|---------|---------|
| EventBridge Scheduler | Daily autonomous trigger |
| Lambda | Agent execution (5 min timeout) |
| DynamoDB | Store audit results + recommendations |
| Amazon Bedrock | Generate listing recommendations |
| Amazon SES | Send daily report email |
| API Gateway | Expose results + manual trigger |
| CloudWatch | Logs and monitoring |

---

## Data Model

### DynamoDB: `rojai-agent-runs`

| Attribute | Type | Description |
|-----------|------|-------------|
| `runId` (PK) | String | UUID for each agent execution |
| `runDate` | String | ISO timestamp |
| `productsAudited` | Number | Count |
| `issuesFound` | Number | Count of low-scoring products |
| `recommendationsGenerated` | Number | Count |
| `status` | String | completed / failed |
| `durationMs` | Number | Execution time |

### DynamoDB: `rojai-recommendations`

| Attribute | Type | Description |
|-----------|------|-------------|
| `recommendationId` (PK) | String | UUID |
| `runId` (GSI) | String | FK to agent run |
| `productId` | String | ID from MockStoreProvider |
| `productName` | String | Product name (denormalised) |
| `qualityScore` | Number | 0-100 |
| `issues` | List[String] | Problems identified |
| `suggestedTitle` | String | AI-generated title |
| `suggestedBulletPoints` | List[String] | AI-generated bullets |
| `suggestedSeoKeywords` | List[String] | AI-generated keywords |
| `suggestedTags` | List[String] | AI-generated tags |
| `createdAt` | String | ISO timestamp |

---

## MockStoreProvider

Since the app has no product database, the agent uses a hardcoded catalog of sample products with intentionally varied quality levels:

```python
SAMPLE_PRODUCTS = [
    {
        "productId": "prod-001",
        "productName": "Handwoven Kilim Pillow",
        "description": "Beautiful handwoven wool pillow from Van, Turkey",
        "category": "Home & Kitchen",
        "marketplace": "shopify",
        "brand": "RojKilim",
        "currentTitle": "Kilim Pillow",              # weak title
        "currentBulletPoints": ["Handwoven", "Wool"],  # too few
        "currentSeoKeywords": [],                       # missing
        "currentTags": ["pillow"],                      # insufficient
    },
    # ... 5-10 more products with varying quality
]
```

This is explicitly a mock for the challenge. A real integration would read from Shopify/Etsy APIs or a managed product database.

---

## Evaluation Rubric

Simple deterministic checks (no AI needed for scoring):

| Check | Points | Pass Criteria |
|-------|--------|---------------|
| Title length | 20 | 50-150 characters |
| Bullet count | 20 | Exactly 5 bullets |
| Bullet quality | 15 | Each 40-250 chars |
| Description length | 15 | 100-500 words |
| SEO keywords present | 15 | ≥5 keywords |
| Tags present | 15 | ≥5 tags |

**Total: 100.** Threshold for recommendations: **< 70.**

---

## API Endpoints (extend existing API Gateway)

| Method | Path | Purpose | Required for MVP? |
|--------|------|---------|-------------------|
| GET | /agent/recommendations | Latest recommendations | Yes |
| GET | /agent/history | Past runs summary | Yes |
| POST | /agent/trigger | Manual run (dev/demo) | Yes |

---

## Repository Structure (additions only)

```
backend/
  agent/
    __init__.py
    handler.py              Agent Lambda entry point
    mock_store.py           Sample product catalog
    evaluator.py            Scoring logic
    recommender.py          Bedrock prompt + response
    result_store.py         DynamoDB writes
    reporter.py             SES email builder
    schemas.py              Agent dataclasses
  agent_api/
    __init__.py
    handler.py              API Lambda for /agent/* routes
infra/
  lib/
    rojAI-stack.ts          Extended with agent resources
```

---

## Environment Variables (Agent Lambda)

| Variable | Description |
|----------|-------------|
| `RUNS_TABLE` | DynamoDB runs table name |
| `RECOMMENDATIONS_TABLE` | DynamoDB recommendations table name |
| `BEDROCK_MODEL_ID` | Inference profile ID |
| `SES_FROM_EMAIL` | Verified sender email |
| `SES_TO_EMAIL` | Report recipient email |

---

## Implementation Plan

### MVP Tasks (Required for Challenge Qualification)

| # | Task | Estimate | Depends |
|---|------|----------|---------|
| 1 | Add DynamoDB tables to CDK (runs + recommendations) | 25 min | — |
| 2 | Create mock_store.py with 8 sample products | 20 min | — |
| 3 | Create evaluator.py (scoring rubric) | 30 min | 2 |
| 4 | Create recommender.py (Bedrock prompt + parsing) | 35 min | — |
| 5 | Create result_store.py (DynamoDB writes) | 20 min | 1 |
| 6 | Create reporter.py (SES email) | 25 min | 5 |
| 7 | Create agent handler.py (orchestrator) | 30 min | 2-6 |
| 8 | Add EventBridge Scheduler to CDK | 15 min | 7 |
| 9 | Add agent Lambda + IAM to CDK | 20 min | 7 |
| 10 | Create agent_api handler (GET + POST routes) | 30 min | 5 |
| 11 | Add agent API routes to CDK | 15 min | 10 |
| 12 | Write agent tests (evaluator, recommender, handler) | 30 min | 7 |
| 13 | End-to-end test: trigger → audit → store → email | 20 min | all |
| **Total** | | **~5 hours** | |

### Post-Challenge Tasks (Optional / Future)

| Task | Description |
|------|-------------|
| React Agent Dashboard page | Display recommendations in UI |
| RecommendationCard component | Visual recommendation cards |
| Routing + nav update | Add "Agent" to sidebar |
| Real product store (DynamoDB CRUD) | Replace mock with persistent catalog |
| Product import UI | Upload products via frontend |
| Recommendation apply button | One-click apply suggestion |
| Multi-marketplace support | Separate scoring per platform |
| Step Functions | Handle >100 products with orchestration |

---

## Acceptance Criteria (MVP)

1. **Autonomous execution**: EventBridge triggers the agent Lambda daily without human action.
2. **Product audit**: Agent evaluates all 8 sample products and assigns quality scores.
3. **AI recommendations**: Low-scoring products receive Bedrock-generated suggestions (title, bullets, keywords, tags).
4. **Persistence**: Results stored in DynamoDB with run ID and timestamps.
5. **Email report**: Summary email sent via SES after each successful run.
6. **API retrieval**: GET /agent/recommendations returns stored results as JSON.
7. **Manual trigger**: POST /agent/trigger starts a run on demand (for demos).
8. **No regression**: Existing /generate-listing endpoint continues to work.
9. **Observability**: Agent execution logged to CloudWatch with structured entries.

---

## Testing Strategy

| Layer | Approach |
|-------|----------|
| evaluator.py | pytest: score calculation for products at various quality levels |
| recommender.py | pytest + mock Bedrock: prompt structure, response parsing |
| result_store.py | pytest + moto: DynamoDB operations |
| agent handler | pytest + mocked dependencies: full orchestration flow |
| agent_api | pytest: route handling, response format |
| End-to-end | Manual POST /agent/trigger → check DynamoDB → verify email |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| SES sandbox limits | Verify sender + recipient before demo |
| Bedrock rate limit | Only 3-5 products need recommendations per run |
| Lambda timeout | 8 products × ~10s each = <2 min, well within 5 min limit |
| Challenge time pressure | MVP is 13 tasks / ~5 hours; dashboard is deferred |

---

## What This Demonstrates for the Challenge

- **Autonomous**: Runs on a schedule without human intervention
- **Intelligent**: Uses Bedrock to make contextual recommendations
- **Persistent**: Maintains state across runs in DynamoDB
- **Communicative**: Proactively sends email reports
- **Observable**: CloudWatch-logged with structured output
- **Extensible**: Clean separation between mock store and future real integrations
