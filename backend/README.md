# Backend

Python Lambda handler for ROJAI listing generation.

## Structure

```
app.py               Lambda entry point — routing, CORS, dispatch
validator.py         Request validation (required fields, enum checks)
schemas.py           Dataclasses and constants
prompt_builder.py    Builds the Bedrock prompt from a ListingRequest
bedrock_service.py   Calls Amazon Bedrock Runtime, validates model output
mock_service.py      Returns realistic mock data (no AWS needed)
local_server.py      Lightweight HTTP wrapper for local development
requirements.txt     Python dependencies
events/              Sample Lambda events for manual testing
tests/               pytest test suite
```

## Local Development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run tests
python -m pytest tests/test_app.py -v

# Start local HTTP server (mock mode)
USE_MOCK_BEDROCK=true python local_server.py
# → http://localhost:8000/generate-listing
```

## API

**POST /generate-listing**

Request:
```json
{
  "productName": "Handwoven kilim pillow",
  "brand": "RojKilim",
  "description": "Handwoven wool pillow made in Van, Turkey",
  "category": "Home & Kitchen",
  "marketplace": "shopify",
  "language": "en",
  "tone": "professional"
}
```

Response (200):
```json
{
  "title": "...",
  "bulletPoints": ["...", "...", "...", "...", "..."],
  "description": "...",
  "seoKeywords": ["...", "..."],
  "tags": ["...", "..."],
  "metadata": {
    "marketplace": "shopify",
    "language": "en",
    "tone": "professional",
    "source": "mock"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_MOCK_BEDROCK` | (required) | `true` for mock, `false` for real Bedrock |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | Model or inference profile ID |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | Comma-separated CORS origins |
| `AWS_REGION` | `us-east-1` | AWS region (auto-set in Lambda) |

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid input |
| 405 | Method not allowed |
| 500 | Unexpected error |
| 502 | Bedrock failure |
