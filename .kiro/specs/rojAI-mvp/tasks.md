# Implementation Plan: RojAI MVP

## Overview

Build the RojAI serverless AI commerce assistant end-to-end: scaffold the monorepo
structure, implement the Python Lambda backend with Bedrock integration, wire up the React
frontend with a local mock mode so UI development needs no live AWS credentials, define the
CDK infrastructure stack, author the prompt template, and write the README. Tasks follow the
Day 1 → Day 2 roadmap ordering: infrastructure scaffold first, then backend, then frontend,
then tests, then documentation.

---

## Tasks

- [ ] 1. Scaffold monorepo structure and config files
  - [x] 1.1 Create infra/ CDK project skeleton
    - Create `infra/cdk.json` with app command `npx ts-node --prefer-ts-exts bin/app.ts`
      and the S3 server-access-logs context key as shown in the design.
    - Create `infra/package.json` with exact dependency versions from the design
      (`aws-cdk-lib@2.140.0`, `constructs@10.3.0`, `aws-cdk@2.140.0`, `ts-node@10.9.2`,
      `typescript@5.4.5`).
    - Create `infra/tsconfig.json` targeting ES2020 with strict mode and `esModuleInterop`.
    - Create empty placeholder files `infra/bin/app.ts` and `infra/lib/rojAI-stack.ts`.
    - _Requirements: 7.1, 7.5_

  - [x] 1.2 Create backend/ Python project skeleton
    - Create `backend/requirements.txt` with pinned versions from the design
      (`boto3>=1.34.0`, `pytest>=8.0.0`, `moto[s3]>=5.0.0`).
    - Add `hypothesis>=6.100.0` to `backend/requirements.txt` for property-based tests.
    - Create empty placeholder files `backend/src/handler.py` and
      `backend/tests/test_handler.py`.
    - Create `backend/src/__init__.py` and `backend/tests/__init__.py`.
    - _Requirements: 7.2, 7.6_

  - [x] 1.3 Create frontend/ Vite + React project skeleton
    - Create `frontend/package.json` with dependencies: `react@18`, `react-dom@18`,
      `typescript@5.4.5`; devDependencies: `vite@5`, `@vitejs/plugin-react`, `vitest`,
      `@testing-library/react`, `@testing-library/jest-dom`, `fast-check`, `jsdom`.
    - Create `frontend/vite.config.ts` with the React plugin and `build.outDir: "dist"`.
    - Create `frontend/tsconfig.json` with `"jsx": "react-jsx"`, strict mode,
      `paths` alias `@/*` → `src/*`.
    - Create `frontend/public/index.html` with a standard React app shell
      (`<div id="root">`).
    - Create `frontend/.env.local` containing `VITE_MOCK_MODE=true`.
    - _Requirements: 7.3, 7.7_

  - [x] 1.4 Create prompts/ directory and listing-v1.txt template
    - Create `prompts/listing-v1.txt` using the exact template text from the design,
      with the three placeholder tokens `{{productName}}`, `{{keyFeatures}}`,
      `{{category}}`.
    - _Requirements: 7.4, 9.1, 9.2, 9.3_

- [ ] 2. Implement CDK infrastructure stack
  - [~] 2.1 Implement CDK app entry point (`infra/bin/app.ts`)
    - Write the entry point that instantiates `cdk.App` and `RojAIStack`, injecting
      `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` from environment variables.
    - _Requirements: 1.5, 4.1, 5.9_

  - [~] 2.2 Implement RojAIStack — S3 bucket and CloudFront distribution
    - In `infra/lib/rojAI-stack.ts`, create the S3 bucket with
      `blockPublicAccess: BlockPublicAccess.BLOCK_ALL`, `removalPolicy: RemovalPolicy.RETAIN`,
      and `versioned: false`.
    - Add a CloudFront OAC (type S3, signing ALWAYS) and a Distribution with the S3 origin
      attached, viewer protocol policy `REDIRECT_TO_HTTPS`, cache policy
      `CachePolicy.CACHING_OPTIMIZED`, default root object `index.html`, and a 404 → 200
      SPA error-response rule.
    - _Requirements: 5.5, 5.6, 5.8, 5.10_

  - [~] 2.3 Implement RojAIStack — Lambda function and IAM grants
    - Add the Generator Lambda using `Runtime.PYTHON_3_12`, handler `handler.handler`,
      `Code.fromAsset("../backend/src")`, timeout 30 s, memory 512 MB.
    - Attach a dedicated `LogGroup` with 30-day retention.
    - Apply IAM grants: `bucket.grantRead(fn, "prompts/*")`,
      `bucket.grantPut(fn, "listings/*")`, and an inline policy for
      `bedrock:InvokeModel` on the Claude 3 Sonnet ARN.
    - Inject `BUCKET_NAME` and `BEDROCK_MODEL_ID` as Lambda environment variables.
    - _Requirements: 4.1, 5.3, 5.4, 5.6, 5.7_

  - [~] 2.4 Implement RojAIStack — API Gateway HTTP API
    - Create an `HttpApi` with `corsPreflight` allowing origins
      `[https://<cfDomain>, http://localhost:3000, http://localhost:5173]`, methods
      `[POST, OPTIONS]`, and headers `["Content-Type"]`.
    - Add the route `POST /listings/generate` backed by `HttpLambdaIntegration`.
    - Enable CloudWatch access logging on the `$default` stage via `CfnStage`
      `accessLogSettings` pointing to a dedicated `LogGroup`.
    - _Requirements: 4.2, 5.1, 5.2_

  - [~] 2.5 Implement RojAIStack — CloudWatch Dashboard, Alarm, and CfnOutputs
    - Create a `Dashboard` named `RojAI-MVP` with widgets for: Lambda invocation count,
      Lambda error count, Lambda P99 duration, API Gateway 4xx error rate, API Gateway
      5xx error rate.
    - Create a CloudWatch Alarm on Lambda `Errors` metric (sum, 5-minute period, threshold
      > 5) with an SNS topic action (email subscription via CDK context key `alarmEmail`).
    - Add `CfnOutput` values for `ApiUrl`, `CloudFrontUrl`, and `BucketName`.
    - _Requirements: 5.9, 6.3, 6.4, 6.5_

  - [ ]* 2.6 Write CDK assertion tests for the infrastructure stack
    - Create `infra/test/rojAI-stack.test.ts` using `aws-cdk-lib/assertions`.
    - Assert: Lambda runtime Python 3.12, timeout 30 s, memory 512 MB.
    - Assert: S3 bucket has `BlockPublicAccess` BLOCK_ALL and removal policy RETAIN.
    - Assert: API Gateway CORS allows `http://localhost:5173`.
    - Assert: Dashboard named `RojAI-MVP` exists.
    - Assert: Alarm threshold 5 over a 5-minute period.
    - _Requirements: 5.3, 5.4, 5.6, 5.1, 6.4, 6.5_

- [~] 3. Checkpoint — infra scaffold complete
  - Run `cd infra && npm install && npm run build` and confirm zero TypeScript errors.
    Ask the user if any clarifications are needed before continuing.

- [ ] 4. Implement Python Lambda handler (`backend/src/handler.py`)
  - [~] 4.1 Implement `validate_request` and core handler skeleton
    - Write `validate_request(body: dict) -> dict` enforcing all field rules from
      Requirement 4.3: `productName` (required, 1–200 chars), `keyFeatures` (required,
      1–2000 chars), `category` (required, 1–100 chars), `imageUrl` (optional, max 2048
      chars, must start with `https://` when present). Return `{fieldName: errorMessage}`
      for every violation, empty dict when valid.
    - Write the `handler(event, context)` entry point: parse JSON body, assign UUID v4
      `requestId`, call `validate_request`, return 400 with field-keyed errors on failure.
    - _Requirements: 4.3, 10.1, 10.5_

  - [ ]* 4.2 Write property test for `validate_request` (Property 1)
    - **Property 1: Request Validation Rejects All Invalid Inputs with Field-Specific Errors**
    - Use `@given` with Hypothesis strategies to generate ListingRequest-shaped dicts
      with random field values including boundary violations.
    - Assert: errors returned ↔ at least one field violates its constraint; error dict
      keys match exactly the set of offending field names; valid inputs produce `{}`.
    - Minimum 100 examples. Tag: `# Feature: rojAI-mvp, Property 1: ...`
    - **Validates: Requirements 4.3, 10.1**

  - [~] 4.3 Implement `all_tokens_present` and `render_prompt`
    - Write `all_tokens_present(template: str) -> bool` returning `True` iff all three
      tokens `{{productName}}`, `{{keyFeatures}}`, `{{category}}` are substrings of
      `template`.
    - Write `render_prompt(template: str, body: dict) -> str` using `.replace()` for each
      token.
    - Wire into the handler: after loading the template, call `all_tokens_present`; return
      503 if False.
    - _Requirements: 4.6, 9.2_

  - [ ]* 4.4 Write property tests for `all_tokens_present` and `render_prompt` (Properties 2 & 6)
    - **Property 2: Prompt Rendering Substitutes All Tokens and Preserves Values**
    - Use `@given` with random non-empty `productName`, `keyFeatures`, `category` strings;
      assert rendered output contains no `{{...}}` tokens and contains each input value as
      a substring.
    - **Property 6: Template Token Validation Rejects Any Template Missing One or More Tokens**
    - Use `@given` with random template strings; assert `all_tokens_present` returns `True`
      iff all three tokens are present.
    - Minimum 100 examples each. Tag each with the property number.
    - **Validates: Requirements 4.6, 9.2**

  - [~] 4.5 Implement `get_prompt_template`, `invoke_bedrock`, and `parse_bedrock_response`
    - Write `get_prompt_template() -> str` using `boto3` S3 client to `get_object` at key
      `prompts/listing-v1.txt` from `BUCKET_NAME`; raise on `ClientError`.
    - Write `invoke_bedrock(prompt: str) -> str` using `boto3` `bedrock-runtime` client
      `invoke_model` with the Claude Messages API format specified in the design; extract
      `response["content"][0]["text"]`.
    - Write `parse_bedrock_response(raw: str) -> dict | None` implementing the four-step
      validation from the design (JSON parse, `title` string, `bulletPoints` non-empty list,
      `description` string).
    - Wire the 3-attempt retry loop and S3 template retrieval into the handler.
    - _Requirements: 4.5, 4.7, 4.8, 9.1, 9.4, 10.2, 10.3_

  - [ ]* 4.6 Write property tests for `parse_bedrock_response` and retry logic (Properties 3 & 4)
    - **Property 3: Bedrock Response Parsing Accepts Valid Structures and Rejects Invalid Ones**
    - Use `@given` to generate JSON dicts with varying key presence and types; assert
      `parse_bedrock_response` returns non-None ↔ structure is valid per design rules.
    - **Property 4: Retry Exhaustion Always Returns 502 and Makes Exactly Three Bedrock Calls**
    - Use `@given` with valid ListingRequests and a mocked Bedrock that always returns
      malformed output; assert handler returns 502 and mock was called exactly 3 times.
    - Minimum 100 examples each.
    - **Validates: Requirements 9.4, 4.4, 4.8, 10.3**

  - [~] 4.7 Implement `log_structured`, `save_artifact`, and complete handler wiring
    - Write `log_structured(request_id, category, duration_ms, status)` that prints a
      JSON object with exactly the four keys `requestId`, `category`, `durationMs`,
      `status` — and no seller-supplied content.
    - Write `save_artifact(request_id, body, listing)` that `PutObject`s the combined
      `{request, response}` JSON to `listings/{request_id}.json`; catch and log any
      exception without propagating it.
    - Complete the handler: assign `requestId` to the listing dict, call `save_artifact`,
      call `log_structured`, return HTTP 200.
    - _Requirements: 4.9, 4.10, 6.1, 6.2, 10.5_

  - [ ]* 4.8 Write property test for `log_structured` (Property 5)
    - **Property 5: Structured Log Contains Exactly the Four Required Fields and No Seller Content**
    - Use `@given` to generate arbitrary `requestId`, `category`, `durationMs`, `status`
      values plus random ListingRequest data; assert the emitted JSON has exactly four keys
      and contains none of the seller-supplied string values.
    - Minimum 100 examples.
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 4.9 Write property test for `requestId` in error responses (Property 9)
    - **Property 9: requestId Is Present in All Error Responses and Matches UUID v4 Format**
    - Use `@given` to drive all error-triggering conditions (400, 502, 503); assert every
      response body contains a `requestId` matching
      `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
    - Minimum 100 examples.
    - **Validates: Requirements 10.5**

  - [ ]* 4.10 Write example-based unit tests for the Lambda handler
    - Using `pytest` + `moto` (S3 mock) + `unittest.mock` (Bedrock mock):
    - Valid end-to-end request → 200 with correct ListingResponse shape.
    - S3 `GetObject` failure → 503, Bedrock never called.
    - Template missing `{{productName}}` → 503, Bedrock never called.
    - All three Bedrock attempts malformed → 502, mock called exactly 3 times.
    - S3 `PutObject` failure → 200 still returned, error logged.
    - Missing `productName` → 400 with `{"productName": "..."}` in error body.
    - `imageUrl` without `https://` → 400 with `{"imageUrl": "..."}` in error body.
    - _Requirements: 10.1, 10.2, 10.3, 4.8, 4.10_

- [~] 5. Checkpoint — backend complete
  - Run `cd backend && pip install -r requirements.txt && python -m pytest tests/ -v` and
    confirm all tests pass. Ask the user if any clarifications are needed before continuing.

- [ ] 6. Implement shared TypeScript types and API abstraction layer
  - [~] 6.1 Create `frontend/src/types.ts` with `ListingRequest` and `ListingResponse`
    - Define the two interfaces exactly as specified in the design, including all field
      constraints as JSDoc comments.
    - _Requirements: 4.3, 4.4_

  - [~] 6.2 Create `frontend/src/api/types.ts` and `frontend/src/api/client.ts`
    - Define `GenerateListing` function type in `api/types.ts`.
    - Implement `generateListing` in `client.ts` using `fetch` against
      `${import.meta.env.VITE_API_URL}/listings/generate`; parse error body and throw a
      plain `Error` with `body.error` or the generic fallback message. Wrap the `fetch` in
      an `AbortController` with a 20-second timeout; on abort throw the timeout message.
    - _Requirements: 3.2, 3.7, 10.4_

  - [~] 6.3 Create `frontend/src/mocks/mockClient.ts`
    - Implement `generateListing` returning a hardcoded valid `ListingResponse` after a
      1.5 s `setTimeout`-based delay. Shape must match the `ListingResponse` interface
      exactly including a mock UUID `requestId`.
    - _Requirements: 3.5 (local dev support implied by design)_

- [ ] 7. Implement React frontend components
  - [~] 7.1 Implement `frontend/src/components/ListingForm.tsx`
    - Render four fields: `productName` (text input), `keyFeatures` (textarea), `category`
      (select dropdown with a fixed list of marketplace categories), `imageUrl` (text input,
      optional).
    - On submit: validate all required fields client-side; for each empty required field
      set an inline error adjacent to its label; do NOT dispatch the API call if any
      required field is empty.
    - Disable the submit button and show a loading spinner while `isLoading === true`.
    - Accept `onSubmit: (req: ListingRequest) => void` and `isLoading: boolean` props.
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [~] 7.2 Implement `frontend/src/components/ListingResult.tsx`
    - When `response` is non-null: render three labelled `<textarea readOnly>` elements
      for `title`, `bulletPoints` (newline-joined), and `description`.
    - When `error` is non-null: render a styled error banner with the human-readable
      message only — no raw HTTP codes, no exception names, no stack traces.
    - Accept `response: ListingResponse | null` and `error: string | null` props.
    - _Requirements: 3.5, 10.4_

  - [~] 7.3 Implement `frontend/src/App.tsx`
    - Select client at startup: if `import.meta.env.VITE_MOCK_MODE === "true"` import
      `mockClient`, else import `client`.
    - Manage `isLoading`, `response`, and `error` React state.
    - On form submit: set `isLoading = true`, clear previous response/error, call
      `generateListing`; on success set `response`; on error set human-readable `error`
      message; always set `isLoading = false`. Implement the 20-second timeout guard
      (show timeout message, re-enable button, preserve form data).
    - Render `<ListingForm>` and `<ListingResult>` wired to state.
    - _Requirements: 3.2, 3.3, 3.4, 3.7_

- [~] 8. Checkpoint — frontend mock mode runnable
  - Run `cd frontend && npm install && npm run dev` (user should run this manually) and
    confirm the app loads at `http://localhost:5173`, the form renders, and submitting with
    `VITE_MOCK_MODE=true` shows a mock listing result after ~1.5 s. Ask the user to verify
    this before continuing.

- [ ] 9. Write frontend tests
  - [~] 9.1 Write example-based tests for `ListingForm` and `mockClient`
    - `ListingForm` renders all four fields and the category dropdown.
    - `ListingForm` submit with all fields populated calls `onSubmit` exactly once.
    - `ListingForm` submit with empty `productName` shows inline error and does NOT call
      `onSubmit`.
    - `mockClient.generateListing` returns an object matching the `ListingResponse`
      interface shape after a delay.
    - _Requirements: 3.1, 3.6_

  - [ ]* 9.2 Write property test for `ListingResult` error display (Property 7)
    - **Property 7: Frontend Error Display Never Exposes Raw HTTP Codes, Exception Names, or Stack Traces**
    - Use `fast-check` `fc.string()` / `fc.record({...})` to generate arbitrary error
      strings; render `<ListingResult error={...} response={null} />` with RTL; assert
      the rendered text does not match `\d{3}`, `Error:`, `Exception`, or `Traceback`.
    - Assert the submit button is in an enabled state after error display.
    - Minimum 100 examples. Tag: `// Feature: rojAI-mvp, Property 7: ...`
    - **Validates: Requirements 10.4**

  - [ ]* 9.3 Write property test for `ListingResult` valid response rendering (Property 8)
    - **Property 8: Valid ListingResponse Renders All Three Components in Separate Labelled Fields**
    - Use `fast-check` `fc.record({...})` to generate valid `ListingResponse` objects
      (title string, bulletPoints array 1–5 strings, description string, requestId UUID
      pattern string); render `<ListingResult response={...} error={null} />` with RTL;
      assert labelled fields for title, bullet points, and description each contain the
      correct content.
    - Minimum 100 examples. Tag: `// Feature: rojAI-mvp, Property 8: ...`
    - **Validates: Requirements 3.5, 1.3**

- [~] 10. Write README.md
  - Update the top-level `README.md` with:
    - Project overview (what RojAI is and does).
    - Prerequisites (Node.js 18+, Python 3.12, AWS CLI configured, CDK bootstrapped).
    - Local development instructions: `cd frontend && npm install && npm run dev`
      (works with `VITE_MOCK_MODE=true`, no AWS credentials needed).
    - Day 1 deployment steps: `cd infra && npm install && cdk deploy`, then upload
      `prompts/listing-v1.txt` to the S3 bucket.
    - Day 2 deployment steps: build frontend, deploy to S3/CloudFront, run smoke tests.
    - Placeholders for `ApiUrl` and `CloudFrontUrl` CDK outputs (to be filled after
      first deploy).
    - _Requirements: 8.3, 8.5_

- [~] 11. Final checkpoint — all tests pass
  - Run `cd backend && python -m pytest tests/ -v` and confirm all backend tests pass.
  - Run `cd frontend && npm run test -- --run` and confirm all frontend tests pass.
  - Run `cd infra && npm run build` and confirm zero TypeScript errors.
  - Ask the user if any questions remain before marking the spec complete.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all core
  implementation tasks are required.
- `VITE_MOCK_MODE=true` in `frontend/.env.local` means the entire frontend is runnable
  without AWS credentials — priority item per user request.
- Do NOT deploy to AWS as part of this task list; deployment is a manual step performed
  after the Day 1 or Day 2 checklists are satisfied.
- Each backend property test must carry the tag comment
  `# Feature: rojAI-mvp, Property N: <title>` for traceability.
- Each frontend property test must carry the tag comment
  `// Feature: rojAI-mvp, Property N: <title>` for traceability.
- The prompt file at `prompts/listing-v1.txt` is deployed to S3 manually after `cdk deploy`
  (or optionally via an S3 BucketDeployment CDK construct added as a stretch goal).
- Checkpoint tasks are not implementation tasks; they are human verification gates.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "4.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.3", "6.2", "6.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.2", "4.4", "4.5", "7.1", "7.2"] },
    { "id": 4, "tasks": ["2.6", "4.6", "4.7", "7.3"] },
    { "id": 5, "tasks": ["4.8", "4.9", "4.10", "9.1"] },
    { "id": 6, "tasks": ["9.2", "9.3"] }
  ]
}
```
