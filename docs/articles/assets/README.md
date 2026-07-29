# Article Assets

Screenshots and diagrams for the article:
**"From Build an Agent Challenge to a Live Shopify Application"**

## Required Images

Place each image in this directory (`docs/articles/assets/`) with the filename listed below.

| # | Filename | Description | Insert After |
|---|----------|-------------|--------------|
| 1 | `architecture-diagram.png` | System architecture diagram showing Shopify Admin (iframe), Render (Docker container + PostgreSQL), and AWS (API Gateway, Lambda, Bedrock, DynamoDB, EventBridge, Secrets Manager, CloudWatch). Show the data flow: Shopify Admin → Render app → Shopify GraphQL API for product data, and Render app → API Gateway → Lambda → Bedrock for recommendations. | "The key insight was separation of concerns..." paragraph |
| 2 | `dashboard-overview.png` | The Product Quality Dashboard as seen inside Shopify admin. Shows the Overview section (10 products, 86/100 avg quality, 9 good, 1 need attention), the Filters section, and the Product Listings with score badges. Use the screenshot showing the full dashboard with the "About scoring" sidebar. | "Renders an overview (total products, average score..." paragraph |
| 3 | `product-detail.png` | The product detail view for "Kilim Rug — 125 x 205 cm" showing the 62/100 score badge, the "Below threshold (70). Recommendations suggested." message, the "Generate AI Recommendation" button, and the product metadata (Status: ACTIVE, Vendor: RojKilim, Product type: Handmade Rug, Tags, Images count). | "Products scoring below 70 are flagged..." paragraph |
| 4 | `ai-recommendation.png` | The AI recommendation panel showing the generated suggestion: the suggested title ("Handwoven Kilim Rug 125x205cm — Authentic Turkish Flatweave in Bold Crimson..."), the five bullet points about craftsmanship and materials. This demonstrates Bedrock output on real product data. | "Clicking 'Generate AI Recommendation' sends the product data..." paragraph |
| 5 | `render-events.png` | Render dashboard showing the "rojai-shopify" web service with successful deploy events (green checkmarks), the service URL, the connected GitHub repo and branch (`feature/render-deployment`), and the Docker/Starter/Blueprint managed badges. | "After fixing the plan name..." paragraph |
| 6 | `github-branches.png` | GitHub repository branches page showing the development progression: `main`, `feature/render-deployment` (PR #7), `develop`, `feature/production-hardening` (PR #6), `feature/aws-recommendations-integration` (PR #5), `feature/production-dashboard` (PR #4). Shows the "ahead" commit counts demonstrating iterative development. | "Each PR was reviewed, tested, and merged..." paragraph |
| 7 | `live-dashboard.png` | (Optional — same as #2 or a variation) The dashboard connected to the live RojKilim store. If you have a screenshot taken from within the actual Shopify admin iframe (showing the Shopify admin chrome around the app), use it here to emphasize "this is running in production." | "The dashboard loaded. Ten products appeared..." paragraph |

## Optional Additional Images

| # | Filename | Description | Purpose |
|---|----------|-------------|---------|
| 8 | `scoring-rubric.png` | A clean visual of the scoring weights table (Title 20, Description 20, Tags 15, etc.) rendered as a graphic rather than a code table | Visual variety in the scoring section |
| 9 | `oauth-flow.png` | Diagram of the Shopify OAuth flow: Admin → App URL → OAuth consent → Callback → Session created → Dashboard rendered | Illustrate Challenge 1 (OAuth complexity) |
| 10 | `before-after-listing.png` | Side-by-side showing the original product listing fields vs. the AI-recommended improvements | Emphasize the tangible value of the recommendations |

## Screenshot Guidelines

- Crop to remove browser chrome (URL bar, bookmarks) unless it adds context
- Redact any sensitive information: API keys, secret values, internal IDs that could be exploited
- Ensure text is legible at standard article width (~700px content area)
- Use PNG format for screenshots with text, JPEG for photos
- The Render dashboard screenshot already shows the service ID — this is fine (public info)
- Product IDs visible in the Shopify dashboard are internal Shopify GIDs — safe to show

## Image Dimensions

- Recommended width: 1200–1600px (will be scaled down by the article renderer)
- Aspect ratio: prefer 16:9 or 4:3 for consistency
- File size: keep under 500KB per image for fast loading
