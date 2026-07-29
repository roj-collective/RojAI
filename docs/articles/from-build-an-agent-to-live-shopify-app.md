# From Build an Agent Challenge to a Live Shopify Application

## How participating in an AWS challenge changed the way I thought about AI — and led me to build software for my own business

---

## A Different Kind of Question

I run a Shopify store called RojKilim. We sell handwoven kilim rugs sourced from Eastern Turkey — one-of-a-kind pieces that cannot be restocked once they sell. As a small business owner, I wear every hat: product sourcing, photography, writing listings, SEO, inventory management, customer experience, shipping. Improving product listings is one of many responsibilities competing for my time, and it is one where the gap between "good enough" and "optimized" directly affects whether buyers find my products.

When I joined the AWS Build an Agent Challenge, I was not just thinking about completing a submission. I was building a listing generator with Lambda and Amazon Bedrock, and as the pieces came together — prompt templates, model invocation, structured output — a different question kept surfacing:

> **How can I use these AWS services to solve a real problem I face every day running my business?**

That question changed everything about how I approached the challenge. Before Bedrock and Lambda, I had thought about listing optimization as a manual process — something I would eventually get to when I had time. The challenge introduced me to serverless AI in a hands-on way that made me realize these technologies were not just interesting; they were directly applicable to a problem I already had. The gap between "a model can generate text" and "a model can improve my specific product listings" turned out to be smaller than I had assumed.

I stopped thinking about what would make a good demo and started thinking about what would make a good tool. A tool for me — a small business owner managing product listings across a growing catalog, without a team of copywriters or SEO specialists.

The listing generator became the first piece. An AI pipeline that could take a product's raw details and produce polished, marketplace-ready copy. The autonomous agent became the second — a system that could audit my entire catalog, score every listing, and tell me which ones needed attention before I noticed the problem myself.

Both pieces worked. Both were technically sound. But throughout the challenge, I was already thinking past the submission. These were not just challenge projects — they were the foundation of something I intended to use.

---

## The Business Problem

Running a small Shopify store with handwoven products means every listing is unique. I cannot template them. Each rug needs an individual title, a description that tells its story, tags that help search algorithms surface it, and SEO metadata that converts browsers into buyers. With ten products, this is manageable. At fifty or a hundred, it becomes a bottleneck.

I knew some of my listings were stronger than others. But I had no systematic way to evaluate them. No score. No rubric. No tool that could look at a product and say: "This title is too short, you need more tags, and your SEO description is missing." I was relying on intuition and occasional manual reviews.

During the challenge, as I built the scoring engine — a deterministic rubric that evaluates title length, description completeness, tag density, images, SEO metadata, vendor info, and listing status — I realized I was building exactly the tool I needed. Not for a fictional catalog. For mine.

---

## From Challenge to Production

The shift from challenge project to production software happened during the challenge itself. I was not extending a completed submission afterward — I was building toward a goal I had identified while the challenge was still underway.

The challenge submissions proved the technical pipeline:
- A listing generator that calls Bedrock and returns structured, high-quality copy
- An autonomous agent that scores products and generates recommendations for underperformers
- AWS CDK infrastructure (Lambda, API Gateway, EventBridge, DynamoDB, Secrets Manager) deployed and tested

What they did not prove was whether these pieces could work together as a real application, connected to a real store, serving a real merchant. That was the next step — and it required solving an entirely different set of problems.

(I later learned I was among the first 100 participants and would receive an AWS Builder jacket — encouraging recognition, though the decision to keep building was already made long before that email arrived.)

---

## Architecture for a Real Business

The original challenge architecture was pure serverless — Lambda, API Gateway, S3, CloudFront. That works for a standalone tool, but my goal required something different. I needed an embedded Shopify app: one that lives inside the Shopify admin, authenticates merchants via OAuth, maintains sessions, and presents a dashboard that feels native to the platform.

I was not building a dashboard because dashboards are interesting. I was building a way to see which of my listings were underperforming without manually reviewing every product page.

The architecture I chose reflects this pragmatism:

| Component | Choice | Why |
|-----------|--------|-----|
| App runtime | Node.js 20 + React Router (SSR) | Shopify's official template; handles OAuth, App Bridge, and server-side rendering |
| Database | PostgreSQL 16 | Prisma ORM for session persistence; relational is the natural fit |
| Hosting | Render | Docker-native, managed PostgreSQL, auto-deploy from GitHub, minimal configuration |
| AI Backend | AWS Lambda + API Gateway | Already deployed and proven during the challenge |
| AI Models | Amazon Bedrock (Claude Sonnet) | Already integrated; produces genuinely useful listing copy |
| Infrastructure | AWS CDK (TypeScript) | Two stacks already defined and tested |

The key architectural decision was separation of concerns. Render hosts the merchant-facing Shopify app — OAuth, sessions, product fetching, dashboard rendering. AWS hosts the AI backend — quality evaluation, recommendation generation, scheduled audits. They communicate over HTTPS with API key authentication stored in Secrets Manager.

![System Architecture](assets/architecture-diagram.png)
*Figure 1: System architecture — Shopify Admin loads the embedded app from Render, which fetches product data via GraphQL and calls the AWS backend for AI recommendations.*

I chose Render over AWS container services because I needed to validate the product, not demonstrate infrastructure expertise. Lambda suits the bursty AI workloads. A persistent container suits the always-on Shopify app. Minimizing operational complexity meant I could focus on the features that would actually help my business.

---

## Building the Tool I Needed

### The Quality Dashboard

The dashboard exists to answer one question I face regularly: which of my listings need work?

When I open RojAI from my Shopify admin, the app authenticates, queries the Shopify GraphQL API for all my products, and scores each one using a TypeScript evaluator aligned rule-for-rule with the Python backend:

```
Title (20 points) + Description (20) + Tags (15) + Images (15)
+ SEO Title (8) + SEO Description (7) + Vendor (5) + Category (5) + Status (5) = 100
```

Products scoring below 70 are flagged as needing attention. The dashboard shows aggregate stats at the top and a filterable product list sorted worst-first. I can immediately see what needs work without opening each product individually.

![Product Quality Dashboard](assets/dashboard-overview.png)
*Figure 2: The Quality Dashboard connected to the live RojKilim store.*

Scoring is implemented on both the frontend and backend. The TypeScript scorer gives instant results without a network round-trip — the dashboard feels fast. The Python scorer runs in the autonomous agent on a daily schedule. Keeping them aligned requires discipline, but the result is scoring that is both immediate (in the dashboard) and continuous (via the scheduled agent).

![Product Detail](assets/product-detail.png)
*Figure 3: Product detail view showing 62/100 score with the "Generate AI Recommendation" button.*

### AI Recommendations That Reflect My Products

I was not integrating Amazon Bedrock simply to use an LLM. I wanted recommendations that could genuinely improve my product listings — recommendations that reference actual product attributes, not generic marketing filler.

Here is what happened with one of my real products:

**Original listing:**
- Title: `Kilim Rug – 125 × 205 cm (4.1 × 6.7 ft)`
- Tags: `handmade, kilims, rugs, wool` (4 tags)
- Quality score: **62/100**
- Issues: Title too short (–20 points), insufficient tags (–15 points), missing SEO description (–3 points)

**AI-generated recommendation:**
- Suggested title: `Handwoven Kilim Rug 125×205cm – Authentic Turkish Flatweave in Bold Crimson | Vintage Geometric Wool Rug by RojKilim`
- Suggested tags: `handmade, kilims, rugs, wool, turkish flatweave, vintage rug, geometric pattern, living room rug, natural wool, handwoven`
- Five bullet points covering craftsmanship, materials, dimensions, use cases, and the rug's uniqueness

The original title was 43 characters. The suggestion is 112 characters — well within the 50–150 optimal range. Tags went from 4 to 10. If I applied these changes, the score would climb from 62 to approximately 90.

What mattered to me was that the recommendation was not generic. It referenced the crimson tones, the geometric patterns, the wool material, the Eastern Turkish origin. Bedrock had enough context from the product data to produce something I would be comfortable publishing on my store.

![AI Recommendation](assets/ai-recommendation.png)
*Figure 4: Bedrock-generated recommendation with improved title, bullet points, and SEO keywords for the underperforming listing.*

### Read-Only First

The app requests only `read_products`. It cannot modify the store. This was deliberate.

I want to observe the quality of recommendations over time before enabling automated changes. The friction of manually reviewing a suggestion and deciding whether to adopt it is a feature, not a limitation. I am the first user of this tool. If I would not trust it to edit my own listings without review, I certainly would not offer that capability to other merchants.

Trust in AI output must be earned through accuracy, not assumed through automation.

---

## Deployment Challenges

Building for my own business added urgency to every debugging session. These were not abstract problems — they were obstacles between me and a tool I intended to use.

**Shopify OAuth.** The first time I visited my deployed URL directly, I saw a generic placeholder page and thought the deployment had failed. It had not — Shopify embedded apps only function inside the admin iframe. The standalone URL shows an unauthenticated landing page by design. Lesson: understand your platform's authentication model before debugging deployment issues.

**Configuration management.** The App URL field in the Shopify Partner Dashboard was read-only. The `shopify.app.toml` file was the source of truth, and the dashboard locks itself to prevent drift. The fix: update the TOML and run `shopify app deploy --allow-updates`. File-driven config, CLI-driven deployment — elegant once understood, confusing on first encounter.

**The silent crash.** The initial deploy returned 502 with no application logs — the container crashed before writing output. A deprecated PostgreSQL plan name was the cause. A one-word fix resolved it, but diagnosing required checking the Events tab rather than Logs, since logs only exist if the app starts.

![Render Deploys](assets/render-events.png)
*Figure 5: Render dashboard showing successful auto-deploys from the feature branch.*

**Cross-service security.** The Shopify app calls the AWS backend for recommendations. This required API key authentication — key in Secrets Manager, timing-safe validation in Lambda, fail-closed design. No secrets in code, no secrets in Git. The security boundary had to be production-grade from day one because this is my real store.

---

## The Moment It Came Together

I remember the exact sequence.

I opened the Shopify admin for my RojKilim store. Clicked Apps. Clicked RojAI Agent. Watched the loading state — probably two seconds, but it felt longer.

Then it appeared. Ten products. My rugs. Real titles, real scores. The overview showed 86/100 average quality, 9 good, 1 needing attention. That one product — the kilim rug I already suspected had a weak listing — staring back at me with a 62/100 badge.

I clicked in. The scoring breakdown confirmed what I had guessed but never quantified: title too short, too few tags. I hit "Generate AI Recommendation" and watched the request travel through Render to API Gateway to Lambda to Bedrock and back. A few seconds later, a complete recommendation appeared — the same quality I had seen in testing, but now against a product with real revenue attached to it.

![Live Dashboard](assets/live-dashboard.png)
*Figure 6: The dashboard loaded with real RojKilim product data — the moment it all came together.*

This was not a demo. Not a challenge submission. It was the tool I had been building toward — working against my own inventory, producing suggestions I could use tomorrow.

The question I asked during the challenge — "How can I use these services to solve a real problem?" — had an answer on the screen.

---

## The Development Journey

The project evolved through seven pull requests, each building on the last:

| PR | Branch | What It Added |
|----|--------|---------------|
| #4 | `feature/production-dashboard` | Quality dashboard with scoring, filtering, product detail views |
| #5 | `feature/aws-recommendations-integration` | Bedrock integration for AI recommendation generation |
| #6 | `feature/production-hardening` | API auth, Secrets Manager, CloudWatch alarms, structured logging |
| #7 | `feature/render-deployment` | Dockerfile, render.yaml, health endpoint, Shopify CLI configuration |

Each PR was self-contained and tested independently before merging into `develop`. The project went from a single Lambda handler to a multi-service production application across these iterations — each one motivated by bringing the tool closer to something I could use on my store.

![GitHub Branches](assets/github-branches.png)
*Figure 7: The branch and PR progression from prototype to production deployment.*

---

## How I Built It: AI-Assisted Development

Building RojAI was also an exercise in using AI as a development partner. I used Kiro — an AI-powered development environment — throughout the engineering process: discussing architecture tradeoffs, iterating on component implementations, reviewing code for edge cases, troubleshooting deployment issues, and improving documentation.

AI accelerated the work significantly. Decisions that might have taken hours of research — understanding Shopify's OAuth model, configuring Prisma for PostgreSQL, structuring CDK stacks for least-privilege IAM — benefited from being able to think through options in conversation before writing code.

But the responsibility remained mine. I made every architectural decision. I tested every feature against my real store. I debugged the deployment failures. I evaluated whether the AI-generated recommendations were good enough for my products. Kiro was a collaborator that made me faster and helped me consider angles I might have missed — not a replacement for understanding the systems I was building.

---

## One Week After Deployment

<!-- PLACEHOLDER: Fill this section after one week of real usage. Topics to cover:

- How often I opened the dashboard during the first week
- Whether I applied any AI recommendations to actual product listings
- Whether the scoring surfaced issues I was previously unaware of
- Whether the autonomous agent (daily EventBridge schedule) produced useful results
- Any unexpected behavior or edge cases with real product data
- What I would change about the scoring weights after observing real results
- Whether cold-start latency on Render affected the experience
- Products that scored differently than expected and what that revealed

Do not fabricate usage data. Write from actual experience. -->

---

## Lessons Learned

**Start with the platform, not the AI.**
The AI call is one HTTP request. The platform integration is OAuth, iframes, sessions, webhooks, configuration management, and deployment coordination. I spent more time understanding Shopify's authentication model than writing prompts for Bedrock.

**Build for yourself first.**
Every architectural decision was easier because I had a concrete use case. "Should I add filtering?" became "Do I need to filter my own products?" The answer was always informed by real usage rather than hypothetical users.

**Separate concerns at service boundaries.**
Lambda does not know it serves a Shopify app. The Shopify app does not know recommendations come from Bedrock. Each boundary is a single HTTP call with a defined contract. This makes every component independently replaceable.

**Read-only earns trust.**
Starting with `read_products` only means the app cannot break my store. I am building confidence in the scoring and recommendation quality through observation before enabling automation.

**Prototype scope and production scope are different disciplines.**
The challenge proved the AI pipeline works. Production required OAuth, sessions, storage, health checks, authentication, secrets, monitoring, and deployment automation. The AI was perhaps 20% of the total effort.

---

## What Is Running Today

| Service | Location | Purpose |
|---------|----------|---------|
| Shopify Embedded App | Render (Docker + PostgreSQL) | Quality dashboard, OAuth, product fetching |
| Listing Generator | AWS Lambda + API Gateway | AI-powered listing recommendations via Bedrock |
| Autonomous Agent | AWS Lambda + EventBridge | Daily scheduled catalog audit |
| Recommendation Store | DynamoDB | Historical agent run results |
| Secrets | AWS Secrets Manager | API keys, Shopify credentials |
| Monitoring | CloudWatch | Logs, alarms, metrics |

The architecture is intentionally lightweight. The infrastructure cost is minimal — pay-per-use Lambda, entry-tier container hosting, managed database. The design prioritizes proving value at small scale before adding complexity. When the tool demonstrates measurable impact on my store, scaling becomes a worthwhile investment rather than premature optimization.

---

## What Comes Next

**Apply and measure.** The immediate next step is applying AI recommendations to actual listings and measuring the impact — do improved titles lead to more search impressions? Do better tags correlate with higher click-through rates? The scoring infrastructure is in place; now I need the measurement loop.

**Write operations.** Add the `write_products` scope with an approval flow. One-click application of recommendations with before/after tracking.

**Bulk improvements.** Process the full catalog at once. Prioritize by score, batch recommendations, present a review queue.

**Offer it to others.** If the tool demonstrates real value on my own store, the natural next step is making it available to other small Shopify merchants facing the same listing quality challenge.

---

## Conclusion

The AWS Build an Agent Challenge asked participants to build something with Bedrock and Lambda. I did. But the more important thing that happened was a shift in perspective.

I stopped asking "How do I complete this challenge?" and started asking "How can I use these services to solve a problem I actually have?" That question led me from a weekend prototype to a production application connected to my live store — scoring real products, generating real recommendations, running against real inventory.

The technical distance from prototype to production was significant. OAuth, session management, deployment topology, API security, secrets management — none of this existed in the challenge submissions. The AI pipeline was the easy part. Making it accessible through a native Shopify experience, secured and monitored and deployed reliably — that was the engineering work.

But what made it worth doing was that I was not building for an abstract user. I was building for myself. Every feature decision was grounded in a real need: Can I see which listings are weak? Can I get specific suggestions for improvement? Can I trust those suggestions enough to use them?

I do not yet know whether the AI recommendations will measurably improve my store's search performance. That experiment is next. But for the first time, I have the infrastructure to run it — a scoring engine, a recommendation pipeline, and a clear way to compare before and after.

The challenge gave me the spark. The business gave me the direction. Building both together produced something neither could have alone: a tool that is genuinely mine, solving a problem I genuinely have.

This is not the end of a challenge project. It is the beginning of a longer journey — building practical AI tools that help small business owners like me compete in marketplaces designed for scale. RojAI started with one store and ten products. Where it goes from here depends on whether the results match the promise. I intend to find out.

---

*Built with Amazon Bedrock, AWS Lambda, AWS CDK, Shopify App Bridge, React Router, Prisma, and Render.*

*Source code: [github.com/roj-collective/RojAI (develop branch)](https://github.com/roj-collective/RojAI/tree/develop)*
