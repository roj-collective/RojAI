# Requirements Document

## Introduction

RojAI is an AWS-native AI commerce assistant built for the AWS Builder Program. It helps
online sellers create high-quality, marketplace-ready product listings using generative AI
powered by Amazon Bedrock. The MVP is scoped to be fully buildable within two days using
a serverless AWS architecture and AWS CDK for infrastructure-as-code.

The system accepts raw seller input (product name, key features, and optional image), and
returns polished product titles, bullet points, and descriptions optimized for marketplace
standards. All components run on AWS-managed services with no self-hosted infrastructure.

---

## Glossary

- **RojAI**: The AI commerce assistant product being built.
- **Seller**: A human user who submits product information to generate listings.
- **Listing**: A marketplace-ready product page comprising a title, bullet points, and a
  description.
- **ListingRequest**: The structured payload submitted by a Seller containing product name,
  features, category, and optional image reference.
- **ListingResponse**: The structured output returned to the Seller containing the generated
  title, bullet points, and description.
- **API**: The HTTP API exposed via Amazon API Gateway that accepts ListingRequests.
- **Generator**: The AWS Lambda function responsible for orchestrating listing generation.
- **Bedrock**: Amazon Bedrock — the AWS managed generative AI service used for text
  generation.
- **BedrockModel**: The foundation model invoked within Bedrock (Claude 3 Sonnet as default).
- **S3**: Amazon Simple Storage Service — used for storing uploaded product images and
  generated listing artifacts.
- **CDK**: AWS Cloud Development Kit — the infrastructure-as-code framework used to define
  and deploy all AWS resources.
- **CloudWatch**: Amazon CloudWatch — used for logging, metrics, and alerting.
- **PromptTemplate**: A versioned text template stored in S3 that is injected with seller
  data before being sent to Bedrock.
- **FrontendApp**: A lightweight web UI (single-page application) hosted on S3 + CloudFront
  that provides the Seller-facing interface.
- **CORSPolicy**: The Cross-Origin Resource Sharing configuration applied to the API to allow
  browser-based requests from the FrontendApp.
- **OAC**: CloudFront Origin Access Control — the mechanism allowing CloudFront to access
  the private S3 bucket serving the FrontendApp.

---

## Requirements

---

### Requirement 1: Product Vision

**User Story:** As a stakeholder, I want a clear definition of what RojAI does and who it
serves, so that the team can make aligned decisions throughout the build.

#### Acceptance Criteria

1. THE RojAI system SHALL act as an AI-powered commerce assistant that generates
   marketplace-ready product listings from seller-supplied input.
2. THE RojAI system SHALL target online sellers who need to create product listings quickly
   without professional copywriting skills.
3. THE RojAI system SHALL produce three listing components for every valid ListingRequest:
   a product title, up to five bullet points, and a product description.
4. THE RojAI system SHALL use Amazon Bedrock as the sole generative AI provider for all
   text-generation tasks.
5. WHEN all prerequisite AWS credentials and CDK bootstrap are in place, THE RojAI system
   SHALL be fully deployable by running `cdk deploy` once from the `infra/` directory
   without additional manual resource creation.

---

### Requirement 2: MVP Scope

**User Story:** As a developer, I want a clearly bounded MVP scope, so that I can deliver
a working system within the two-day build constraint.

#### Acceptance Criteria

1. THE MVP SHALL include the following components and no others: FrontendApp, API,
   Generator Lambda, Bedrock integration, S3 artifact storage, and CloudWatch logging.
2. THE MVP SHALL support single-turn listing generation only, defined as: one ListingRequest
   produces one ListingResponse with no server-side session state maintained between requests;
   multi-turn conversation and listing refinement are explicitly out of scope for the MVP
   release.
3. THE MVP SHALL support text-based listing generation only; image-based generation requiring
   multimodal inference is explicitly out of scope for the MVP release and is a post-MVP
   stretch goal.
4. THE MVP SHALL NOT include user authentication, seller accounts, or persistent listing
   history in the MVP release.
5. THE MVP SHALL NOT include marketplace API integrations (e.g., Amazon Selling Partner API,
   eBay Listings API) in the MVP release.
6. WHEN the API receives a request for a feature that is out of scope for the MVP release,
   THE API SHALL return a 501 Not Implemented response with a JSON body containing an
   `error` field whose value describes the unsupported feature by name.

---

### Requirement 3: User Flow

**User Story:** As a Seller, I want a simple end-to-end flow from entering product details
to receiving a polished listing, so that I can create listings quickly without technical
knowledge.

#### Acceptance Criteria

1. WHEN a Seller opens the FrontendApp, THE FrontendApp SHALL display an input form
   containing fields for: product name (required), key features (required, free text),
   product category (required, dropdown), and product image URL (optional).
2. WHEN a Seller submits the input form with all required fields populated, THE FrontendApp
   SHALL dispatch the ListingRequest HTTP call to the API within 500ms of the submit action.
3. WHEN a Seller submits the input form, THE FrontendApp SHALL display a visible loading
   indicator within 500ms of the submit action and keep it visible until a ListingResponse
   or error is received.
4. WHEN the API receives a valid ListingRequest, THE API SHALL return a ListingResponse to
   the FrontendApp within 15 seconds, measured from the time the API Gateway receives the
   request to the time the HTTP response is sent.
5. WHEN a ListingResponse is received, THE FrontendApp SHALL display the generated title,
   bullet points, and description each in a separate, labelled text area from which the
   Seller can select and copy text.
6. WHEN a Seller submits the input form with a required field missing or empty, THE
   FrontendApp SHALL display an inline validation error message adjacent to each invalid
   field, identifying it by its label name, without dispatching a request to the API.
7. IF THE FrontendApp does not receive a ListingResponse within 20 seconds of dispatching
   the request, THEN THE FrontendApp SHALL hide the loading indicator, display a timeout
   error message, and re-enable the submit button with all previously entered form data
   intact so that the Seller can retry without re-entering their information.

---

### Requirement 4: System Architecture

**User Story:** As an architect, I want a documented system architecture, so that all
components and their interactions are unambiguous before development begins.

#### Acceptance Criteria

1. THE RojAI system SHALL execute all compute exclusively via AWS Lambda with no persistent
   compute instances (e.g., no EC2, ECS, or EKS resources).
2. THE API SHALL expose a single POST endpoint at the path `/listings/generate` that accepts
   a JSON ListingRequest body.
3. THE ListingRequest SHALL contain the following fields with the specified constraints:
   `productName` (string, required, max 200 characters), `keyFeatures` (string, required,
   max 2000 characters), `category` (string, required, max 100 characters), and `imageUrl`
   (string, optional, max 2048 characters, must be a valid HTTPS URL when present).
4. THE ListingResponse SHALL contain the following fields: `title` (string, max 200
   characters), `bulletPoints` (array of strings, exactly 1–5 items, each item max 500
   characters), `description` (string, max 2000 characters), and `requestId` (UUID v4
   string).
5. WHEN the Generator is invoked, THE Generator SHALL retrieve the PromptTemplate from S3
   at key `prompts/listing-v1.txt` before invoking Bedrock, so that prompt changes can be
   made without redeploying Lambda code.
6. WHEN the Generator has retrieved the PromptTemplate, THE Generator SHALL replace the
   `{{productName}}`, `{{keyFeatures}}`, and `{{category}}` placeholder tokens with the
   corresponding values from the ListingRequest before sending the prompt to Bedrock.
7. WHEN Bedrock returns a response, THE Generator SHALL validate and parse the response
   according to the rules in Requirement 9 and map the output to a ListingResponse before
   returning it to the API.
8. IF THE Generator receives a response from Bedrock that fails the validation defined in
   Requirement 9, Criterion 4, THEN THE Generator SHALL retry the Bedrock invocation up to
   two additional times (three total attempts) before returning a 502 error to the API.
9. WHEN THE Generator has produced a valid ListingResponse, THE Generator SHALL write the
   ListingRequest and ListingResponse pair as a single JSON artifact to S3 at key
   `listings/{requestId}.json` before returning the ListingResponse to the API.
10. IF THE Generator fails to write the artifact to S3 after producing a valid
    ListingResponse, THE Generator SHALL log the S3 write failure to CloudWatch Logs and
    still return the ListingResponse to the Seller; the S3 write failure SHALL NOT cause the
    API to return an error to the Seller.

---

### Requirement 5: AWS Architecture

**User Story:** As a developer, I want a prescribed AWS service architecture, so that I
select the correct services and configurations during implementation.

#### Acceptance Criteria

1. THE API SHALL be implemented using Amazon API Gateway HTTP API (not REST API) to
   minimize cost and latency.
2. THE CORSPolicy applied to the API SHALL allow requests from the FrontendApp CloudFront
   domain; WHERE the environment is development, THE CORSPolicy SHALL additionally allow
   requests from `http://localhost:3000` and `http://localhost:5173`.
3. THE Generator SHALL be implemented as an AWS Lambda function using one runtime selected
   from Node.js 20 or Python 3.12, applied consistently across all Lambda functions in
   the stack.
4. THE Generator Lambda SHALL be configured with a timeout of 30 seconds and a memory
   allocation of 512 MB.
5. THE RojAI system SHALL use a single S3 bucket with two key prefixes: `prompts/` for
   PromptTemplates and `listings/` for generated listing artifacts.
6. THE S3 bucket SHALL have all public access settings blocked; THE FrontendApp static
   assets SHALL be served via a CloudFront distribution using Origin Access Control (OAC)
   so that the bucket never requires public read access; THE Generator Lambda execution
   role SHALL be the only IAM principal with direct S3 API access to the bucket.
7. THE Generator Lambda execution role SHALL be granted the minimum IAM permissions
   required: `bedrock:InvokeModel` on the BedrockModel ARN, `s3:GetObject` on
   `prompts/*`, `s3:PutObject` on `listings/*`, and `logs:CreateLogGroup`,
   `logs:CreateLogStream`, `logs:PutLogEvents` on the Generator's CloudWatch Log Group ARN.
8. THE FrontendApp SHALL be served via an Amazon CloudFront distribution configured with
   a viewer protocol policy of "Redirect HTTP to HTTPS" so that all Seller traffic is
   encrypted in transit.
9. THE CDK stack SHALL deploy all resources — API Gateway, Lambda, S3 bucket, CloudFront
   distribution, OAC, and IAM roles — in a single `cdk deploy` invocation.
10. WHEN the CDK stack is destroyed via `cdk destroy`, THE CDK stack SHALL retain the S3
    bucket by setting its removal policy to RETAIN, to prevent accidental data loss.

---

### Requirement 6: Observability and Logging

**User Story:** As an operator, I want structured logging and basic metrics, so that I can
monitor system health and diagnose failures quickly.

#### Acceptance Criteria

1. THE Generator SHALL emit a structured JSON log entry to CloudWatch Logs for every
   ListingRequest processed, containing: `requestId`, `category`, `durationMs` (measured
   from the moment the Lambda handler receives the event to the moment the handler returns
   a response), and `status` (the string `"success"` or `"error"`).
2. THE Generator SHALL NOT include `productName`, `keyFeatures`, `imageUrl`, or any other
   field containing seller-supplied content in any CloudWatch Logs log entry.
3. THE API SHALL have CloudWatch access logging enabled, capturing for each request: HTTP
   method, request path, HTTP response status code, and integration latency in milliseconds.
4. THE RojAI system SHALL create a CloudWatch Dashboard named `RojAI-MVP` containing
   widgets for: Lambda invocation count, Lambda error count, Lambda P99 duration, and API
   Gateway 4xx and 5xx error rates.
5. WHEN the Lambda error count metric exceeds five errors within any five-minute evaluation
   period, THE RojAI system SHALL transition a CloudWatch Alarm to the ALARM state, send a
   notification to a configured SNS topic, and emit a structured JSON log entry to
   CloudWatch Logs containing `alarmName`, `newState` (`"ALARM"`), and `timestamp`.

---

### Requirement 7: Folder Structure

**User Story:** As a developer, I want a prescribed project folder structure, so that the
codebase is navigable and follows AWS CDK conventions.

#### Acceptance Criteria

1. THE project SHALL contain a top-level `infra/` directory that holds all CDK stack code.
2. THE project SHALL contain a top-level `backend/` directory that holds all Lambda function
   code for the Generator.
3. THE project SHALL contain a top-level `frontend/` directory that holds all FrontendApp
   source files.
4. THE project SHALL contain a top-level `prompts/` directory that holds versioned
   PromptTemplate files named using the pattern `{name}-v{N}.txt`
   (e.g., `listing-v1.txt`).
5. THE `infra/` directory SHALL contain: `bin/` (CDK app entry point), `lib/` (stack
   definitions), and a `cdk.json` configuration file.
6. THE `backend/` directory SHALL contain: a `src/` subdirectory for Lambda handler code,
   a `tests/` subdirectory for unit tests, and a dependency manifest file matching the
   runtime selected in Requirement 5, Criterion 3 (`package.json` for Node.js 20 or
   `requirements.txt` for Python 3.12).
7. THE `frontend/` directory SHALL contain: `src/` for application source, `public/` for
   static assets, and a `package.json` build manifest file.

---

### Requirement 8: Development Roadmap and Milestones

**User Story:** As a project manager, I want a two-day development roadmap with clear
milestones, so that progress can be tracked and the team stays on schedule.

#### Acceptance Criteria

1. THE development roadmap SHALL be divided into Day 1 and Day 2 tracks with explicitly
   assigned deliverables.
2. THE Day 1 deliverables SHALL include: CDK project scaffolding, S3 bucket creation,
   Lambda function creation with Bedrock integration, API Gateway HTTP API configuration,
   PromptTemplate authored and uploaded to S3, and a working end-to-end API test via curl
   or Postman.
3. THE Day 2 deliverables SHALL include: FrontendApp build and deployment to S3/CloudFront,
   CloudWatch Dashboard and Alarm configuration, CDK stack validation with `cdk diff` and
   `cdk deploy`, end-to-end smoke test from FrontendApp to ListingResponse display, and a
   README.md update containing at minimum: deployment steps, the API Gateway endpoint URL,
   and the CloudFront FrontendApp URL.
4. WHEN Day 1 deliverables are complete, THE team SHALL verify the milestone by invoking
   the `POST /listings/generate` endpoint via curl or Postman and receiving an HTTP 200
   response containing a ListingResponse with a non-empty `title`, at least one non-empty
   item in `bulletPoints`, and a non-empty `description`.
5. WHEN Day 2 deliverables are complete, THE team SHALL verify the milestone by loading the
   FrontendApp URL in a browser, submitting a ListingRequest, and confirming that the
   ListingResponse `title`, `bulletPoints`, and `description` values are each displayed in
   their own labelled field without any browser console errors.
6. THE Day 2 stretch goals SHALL include: optional product image upload to S3 with
   multimodal Bedrock inference, basic listing quality scoring using a second Bedrock
   invocation, and a copy-to-clipboard button in the FrontendApp.

---

### Requirement 9: PromptTemplate Design

**User Story:** As a developer, I want a defined PromptTemplate specification, so that
Bedrock receives consistent, well-structured prompts that produce reliable listing output.

#### Acceptance Criteria

1. THE PromptTemplate SHALL be stored in S3 under the key `prompts/listing-v1.txt`;
   IF THE Generator cannot retrieve this object from S3, THEN THE Generator SHALL return
   a 503 error without invoking Bedrock.
2. THE PromptTemplate SHALL contain exactly three placeholder tokens: `{{productName}}`,
   `{{keyFeatures}}`, and `{{category}}`, which the Generator SHALL replace with the
   corresponding values from the ListingRequest before invoking Bedrock; IF the loaded
   template does not contain all three tokens, THE Generator SHALL return a 503 error
   without invoking Bedrock.
3. THE PromptTemplate SHALL instruct Bedrock to return output as a JSON object with
   `title` (string), `bulletPoints` (array of strings), and `description` (string) as the
   only top-level keys, so that the Generator can parse the response with a deterministic
   schema.
4. THE Generator SHALL validate that the Bedrock response body is parseable as JSON and
   contains a `title` key (string), a `bulletPoints` key (array of at least one string),
   and a `description` key (string); IF the response fails any of these checks, THEN THE
   Generator SHALL treat it as a malformed response and apply the retry logic defined in
   Requirement 4, Criterion 8.
5. WHEN a new PromptTemplate is uploaded to S3 at the key `prompts/listing-v1.txt`, THE
   Generator SHALL retrieve and use the updated template on the next invocation without
   requiring a Lambda redeployment; THE Generator SHALL NOT cache the template in memory
   between invocations.

---

### Requirement 10: Error Handling

**User Story:** As a Seller, I want clear error feedback when something goes wrong, so that
I understand what happened and can take corrective action.

#### Acceptance Criteria

1. IF THE API receives a ListingRequest with a missing required field or a field value that
   violates the constraints defined in Requirement 4, Criterion 3, THEN THE API SHALL return
   a 400 Bad Request response with a JSON body containing an `error` field that identifies
   each offending field by its exact field name.
2. IF THE Generator fails to retrieve the PromptTemplate from S3 or detects that the
   retrieved template is structurally invalid per Requirement 9, Criterion 2, THEN THE
   Generator SHALL return a 503 Service Unavailable response to the API with a JSON body
   containing an `error` field and the `requestId`.
3. IF THE Generator exhausts all Bedrock retry attempts as defined in Requirement 4,
   Criterion 8, THEN THE Generator SHALL return a 502 Bad Gateway response to the API with
   a JSON body containing an `error` field and the `requestId`.
4. IF THE API returns a 4xx or 5xx response, THEN THE FrontendApp SHALL display a
   human-readable error message that does not include raw HTTP status codes, exception type
   names, or stack trace content; THE FrontendApp SHALL re-enable the submit button so that
   the Seller can retry.
5. THE Generator SHALL assign a unique `requestId` (UUID v4) to every ListingRequest upon
   receipt, and SHALL include the `requestId` in all error responses so that operators can
   correlate logs with reported failures.
