# From Build an Agent Challenge to a Live Shopify Application

## How four weeks of AWS Builder Center challenges turned into production software for my own business

---

## A Different Kind of Question

I run a Shopify store called [RojKilim](https://rojkilim.com). We sell handwoven kilim rugs sourced from Eastern Turkey — one-of-a-kind pieces that cannot be restocked once they sell. As a small business owner, I wear every hat: product sourcing, photography, writing listings, SEO, inventory management, customer experience, shipping. Improving product listings is one of many responsibilities competing for my time, and it is one where the gap between "good enough" and "optimized" directly affects whether buyers find my products.

When I joined the AWS Build an Agent Challenge, I was not just thinking about completing a submission. I was building a listing generator with AWS Lambda and Amazon Bedrock, and as the pieces came together — prompt templates, model invocation, structured output — a different question kept surfacing:

> **How can I use these AWS services to solve a real problem I face every day running my business?**

That question changed everything about how I approached the challenge. Before Bedrock and Lambda, I had thought about listing optimization as a manual process — something I would eventually get to when I had time. The challenge introduced me to serverless AI in a hands-on way that made me realize these technologies were not just interesting; they were directly applicable to a problem I already had. The gap between "a model can generate text" and "a model can improve my specific product listings" turned out to be smaller than I had assumed.

I stopped thinking about what would make a good demo and started thinking about what would make a good tool. A tool for me — a small business owner managing product listings across a growing catalog, without a team of copywriters or SEO specialists.

---

## The Journey So Far

This article is the fourth chapter of a story that has been building week by week through AWS Builder Center challenges.

**Week 1 — AI Listing Generator**
I built an [AI-powered listing assistant](https://builder.aws.com/content/3AuwQrf4wn8WjdpFdXEY1DDgsyr/weekend-productivity-challenge-rojai-ai-listing-assistant) using Amazon Bedrock, AWS Lambda, Amazon API Gateway, and AWS CDK. A seller fills a form, Lambda renders a prompt, Bedrock returns polished marketplace-ready copy. This proved that generative AI could help small merchants create better listings — instantly, affordably, and without copywriting expertise.

**Week 2 — Autonomous Recommendation Agent**
I expanded the listing generator into an [autonomous AI agent for e-commerce merchandising](https://builder.aws.com/content/3Gkji7MzXhheAkMlhNv4lPkOV7q/weekend-agent-challenge-rojai-agent-for-e-commerce-merchandising). The agent runs on a schedule via Amazon EventBridge, evaluates product quality using a deterministic scoring rubric, and calls Bedrock for improvement suggestions on anything scoring below threshold. RojAI was becoming more than a single AI feature — it was becoming a system.

**Week 3 — The AI Store Coach Vision**
[Ben Fowler's Weekend Challenge](https://builder.aws.com/content/3Gs3zknX5EUiUuZwafGAG3KBCx3/weekend-challenge-what-would-you-build-to-skip-your-most-annoying-task) asked builders: "What would you build to skip your most annoying task?" While writing my response, I realized I was no longer describing a hypothetical idea. I was describing the next evolution of RojAI — an AI Store Coach that continuously monitors a Shopify store, identifies weak listings, explains why they need attention, and recommends improvements before they impact sales. That challenge became the roadmap for what I built next.

**Week 4 — Production Shopify Application**
This article. The vision from Week 3 is now deployed — an embedded Shopify app connected to my live store, scoring products, generating recommendations, and serving as the foundation for the AI Store Coach.

```
Week 1: AI Listing Generator
       ↓
Week 2: Autonomous Recommendation Agent
       ↓
Week 3: AI Store Coach Vision
       ↓
Week 4: Production Shopify Application
```

Each week built on the last. The progression was not planned from the start — it emerged from repeatedly asking the same question: how can this help my business?

---

## The Business Problem

Running a small Shopify store with handwoven products means every listing is unique. I cannot template them. Each rug needs an individual title, a description that tells its story, tags that help search algorithms surface it, and SEO metadata that converts browsers into buyers. With ten products, this is manageable. At fifty or a hundred, it becomes a bottleneck.

I knew some of my listings were stronger than others. But I had no systematic way to evaluate them. No score. No rubric. No tool that could look at a product and say: "This title is too short, you need more tags, and your SEO description is missing." I was relying on intuition and occasional manual reviews.

During Week 2, as I built the scoring engine — a deterministic rubric that evaluates title length, description completeness, tag density, images, SEO metadata, vendor info, and listing status — I realized I was building exactly the tool I needed. Not for a fictional catalog. For mine.

That realization bridged the gap between "challenge project" and "production software."

---

## From Challenge to Production

The shift happened across Weeks 2 and 3. I was not extending a completed submission afterward — I was building toward a goal that had been crystallizing over consecutive weeks.

The first two challenges proved the technical pipeline:
- A listing generator that calls Amazon Bedrock and returns structured, high-quality copy
- An autonomous agent that scores products and generates recommendations for underperformers
- AWS CDK infrastructure (AWS Lambda, Amazon API Gateway, Amazon EventBridge, Amazon DynamoDB, AWS Secrets Manager) deployed and tested

What they did not prove was whether these pieces could work together as an integrated application, connected to a live store, serving an actual merchant. The Week 3 challenge helped me articulate that next step — and this week, I built it.

(I later learned I was among the first 100 challenge participants and would receive an AWS Builder jacket — encouraging recognition, though the decision to keep building was already made long before that email arrived.)

---

## Architecture for a Real Business

The challenge architecture was pure serverless — Lambda, API Gateway, S3, CloudFront. That works for a standalone tool, but my goal required something different. I needed an embedded Shopify app: one that lives inside the Shopify admin, authenticates merchants via OAuth, maintains sessions, and presents a dashboard that feels native to the platform.

I was not building a dashboard because dashboards are interesting. I was building a way to see which of my listings were underperforming without manually reviewing every product page — the "most annoying task" I had described during Week 3.

The architecture I chose reflects this pragmatism:

| Component | Choice | Why |
|-----------|--------|-----|
| App runtime | Node.js 20 + React Router (SSR) | Shopify's official template; handles OAuth, Shopify App Bridge, and server-side rendering |
| Database | PostgreSQL 16 | Prisma for session persistence; relational is the natural fit |
| Hosting | Render | Docker-native, managed PostgreSQL, auto-deploy from GitHub, minimal configuration |
| AI Backend | AWS Lambda + Amazon API Gateway | Already deployed and proven during Weeks 1–2 |
| AI Models | Amazon Bedrock (Claude Sonnet) | Already integrated; produces genuinely useful listing copy |
| Infrastructure | AWS CDK (TypeScript) | Two stacks already defined and tested |

The key architectural decision was separation of concerns. Render hosts the merchant-facing Shopify app — OAuth, sessions, product fetching, dashboard rendering. AWS hosts the AI backend — quality evaluation, recommendation generation, scheduled audits. They communicate over HTTPS with API key authentication stored in AWS Secrets Manager.

![System Architecture](assets/architecture-diagram.png)
*Figure 1: System architecture — Shopify Admin loads the embedded app from Render, which fetches product data via GraphQL and calls the AWS backend for AI recommendations.*

I chose Render over AWS container services because I needed to validate the product, not demonstrate infrastructure expertise. Lambda suits the bursty AI workloads. A persistent container suits the always-on Shopify app. Minimizing operational complexity meant I could focus on the features that would actually help my business.

---

## Building the Tool I Needed

### The Quality Dashboard

The dashboard exists to answer one question I face regularly: which of my listings need work?

When I open RojAI from my Shopify admin, the app authenticates, queries the Shopify GraphQL API for my products, and scores each one using a TypeScript evaluator aligned rule-for-rule with the Python backend from Week 2:

```
Title (20 points) + Description (20) + Tags (15) + Images (15)
+ SEO Title (8) + SEO Description (7) + Vendor (5) + Category (5) + Status (5) = 100
```

Products scoring below 70 are flagged as needing attention. The dashboard shows aggregate stats at the top and a filterable product list sorted worst-first. I can immediately see what needs work without opening each product individually.

![Product Quality Dashboard](assets/dashboard-overview.png)
*Figure 2: The Quality Dashboard showing 10 products, average quality 86/100, with filtering and quality breakdown.*

Scoring is implemented on both the frontend and backend. The TypeScript scorer gives instant results without a network round-trip — the dashboard feels fast. The Python scorer runs in the autonomous agent on a daily schedule via Amazon EventBridge. Keeping them aligned requires discipline, but the result is scoring that is both immediate (in the dashboard) and continuous (via the agent).

![Product Detail](assets/product-detail.png)
*Figure 3: Product detail view — 62/100 score with issues identified and the "Generate AI Recommendation" button.*

### AI Recommendations That Reflect My Products

I was not integrating Amazon Bedrock simply to use an LLM. I wanted recommendations that reference actual product attributes — not generic marketing filler.

Here is what happened with one of my products:

**Original listing:**
- Title: `Kilim Rug – 125 × 205 cm (4.1 × 6.7 ft)`
- Tags: `handmade, kilims, rugs, wool` (4 tags)
- Quality score: **62/100**
- Issues: Title too short (–20 points), insufficient tags (–15 points), missing SEO description (–3 points)

**AI-generated recommendation:**
- Suggested title: `Handwoven Kilim Rug 125×205cm – Authentic Turkish Flatweave in Bold Crimson | Vintage Geometric Wool Rug by RojKilim`
- Suggested tags: `handmade, kilims, rugs, wool, turkish flatweave, vintage rug, geometric pattern, living room rug, natural wool, handwoven`
- Five bullet points covering craftsmanship, materials, dimensions, use cases, and uniqueness

The original title was 43 characters. The suggestion is 112 — well within the 50–150 optimal range. Tags went from 4 to 10. If applied, the score would climb from 62 to approximately 90.

What mattered was that the recommendation was specific. It referenced the crimson tones, the geometric patterns, the wool material, the Eastern Turkish origin. Bedrock had enough context from the product data to produce something I would be comfortable publishing.

![AI Recommendation](assets/ai-recommendation.png)
*Figure 4: Amazon Bedrock-generated recommendation — improved title, bullet points, and SEO keywords tailored to the product.*

### Read-Only First

The app requests only `read_products`. It cannot modify the store. This was deliberate.

I want to observe recommendation quality over time before enabling automated changes. The friction of manually reviewing a suggestion and deciding whether to adopt it is a feature, not a limitation. I am the first user of this tool. If I would not trust it to edit my own listings without review, I certainly would not offer that capability to other merchants.

Trust in AI output must be earned through accuracy, not assumed through automation.

---

## Deployment Challenges

Building for my own business added urgency to every debugging session. These were not abstract problems — they were obstacles between me and the tool I had envisioned.

**Shopify OAuth.** The first time I visited my deployed URL directly, I saw a generic placeholder page and thought the deployment had failed. It had not — Shopify embedded apps only function inside the admin iframe. The standalone URL shows an unauthenticated landing page by design. Lesson: understand your platform's authentication model before debugging deployment issues.

**Configuration management.** The App URL field in the Shopify Partner Dashboard was read-only. The `shopify.app.toml` file was the source of truth, and the dashboard locks itself to prevent drift. The fix: update the TOML and run `shopify app deploy --allow-updates`. File-driven config, CLI-driven deployment — elegant once understood, confusing on first encounter.

**The silent crash.** The initial deploy returned 502 with no application logs — the container crashed before writing output. A deprecated PostgreSQL plan name was the cause. A one-word fix resolved it, but diagnosing required checking the Events tab rather than Logs, since logs only exist if the app starts.

![Render Deploys](assets/render-events.png)
*Figure 5: Render dashboard showing successful deployments after resolving configuration issues.*

**Cross-service security.** The Shopify app calls the AWS backend for recommendations. This required API key authentication — key in AWS Secrets Manager, timing-safe validation in Lambda, fail-closed design. No secrets in code, no secrets in Git. The security boundary had to be production-grade from day one.

---

## The Moment It Came Together

I opened the Shopify admin for my RojKilim store. Clicked Apps. Clicked RojAI Agent. Watched the loading state — probably two seconds, but it felt longer.

Then it appeared. Ten products. My rugs. Titles I wrote, scores I had never seen. The overview showed 86/100 average quality, 9 good, 1 needing attention. That one product — the kilim rug I already suspected had a weak listing — staring back at me with a 62/100 badge.

I clicked in. The scoring breakdown confirmed what I had guessed but never quantified: title too short, too few tags. I hit "Generate AI Recommendation" and watched the request travel through Render to Amazon API Gateway to AWS Lambda to Amazon Bedrock and back. A few seconds later, a complete recommendation appeared — specific to this rug, referencing its actual attributes.

![Live Dashboard](assets/live-dashboard.png)
*Figure 6: The dashboard loaded with live RojKilim product data — four weeks of building, realized in one screen.*

This was the AI Store Coach I had described during Week 3 — working against my own inventory, producing suggestions I could act on immediately.

The question I asked during Week 1 — "How can I use these services to solve a problem I actually have?" — had an answer on the screen.

---

## The Development Journey

The project evolved through seven pull requests across two weeks of implementation:

| PR | Branch | What It Added |
|----|--------|---------------|
| #4 | `feature/production-dashboard` | Quality dashboard with scoring, filtering, product detail views |
| #5 | `feature/aws-recommendations-integration` | Amazon Bedrock integration for AI recommendation generation |
| #6 | `feature/production-hardening` | API auth, AWS Secrets Manager, Amazon CloudWatch alarms, structured logging |
| #7 | `feature/render-deployment` | Dockerfile, render.yaml, health endpoint, Shopify CLI configuration |

Each PR was self-contained and tested independently before merging. The project went from a single Lambda handler to a multi-service application across these iterations — each one bringing the tool closer to the vision from Week 3.

![GitHub Branches](assets/github-branches.png)
*Figure 7: The branch and PR progression from prototype to deployed application.*

---

## How I Built It: AI-Assisted Development

Building RojAI was also an exercise in using AI as a development partner. I used Kiro — an AI-powered development environment — throughout the engineering process: discussing architecture tradeoffs, iterating on component implementations, reviewing code for edge cases, troubleshooting deployment issues, and improving documentation.

AI accelerated the work significantly. Decisions that might have taken hours of research — understanding Shopify's OAuth model, configuring Prisma for PostgreSQL, structuring AWS CDK stacks for least-privilege IAM — benefited from being able to think through options in conversation before writing code.

But the responsibility remained mine. I made every architectural decision. I tested every feature against my store. I debugged the deployment failures. I evaluated whether the AI-generated recommendations were good enough for my products. Kiro was a collaborator that made me faster — not a replacement for understanding the systems I was building.

---

## Lessons Learned

**Start with the platform, not the AI.**
The AI call is one HTTP request. The platform integration is OAuth, iframes, sessions, webhooks, configuration management, and deployment coordination. I spent more time understanding Shopify's authentication model than writing prompts for Amazon Bedrock.

**Build for yourself first.**
Every architectural decision was easier because I had a concrete use case. "Should I add filtering?" became "Do I need to filter my own products?" The answer was always informed by actual usage rather than hypothetical users.

**Separate concerns at service boundaries.**
Lambda does not know it serves a Shopify app. The Shopify app does not know recommendations come from Bedrock. Each boundary is a single HTTP call with a defined contract. This makes every component independently replaceable.

**Read-only earns trust.**
Starting with `read_products` only means the app cannot break my store. I am building confidence in scoring and recommendation quality through observation before enabling automation.

**Prototype scope and production scope are different disciplines.**
The challenges proved the AI pipeline works. Production required OAuth, sessions, storage, health checks, authentication, secrets, monitoring, and deployment automation. The AI was perhaps 20% of the total effort.

---

## What Is Running Today

| Service | Location | Purpose |
|---------|----------|---------|
| Shopify Embedded App | Render (Docker + PostgreSQL) | Quality dashboard, OAuth, product fetching |
| Listing Generator | AWS Lambda + Amazon API Gateway | AI-powered listing recommendations via Amazon Bedrock |
| Autonomous Agent | AWS Lambda + Amazon EventBridge | Daily scheduled catalog audit |
| Recommendation Store | Amazon DynamoDB | Historical agent run results |
| Secrets | AWS Secrets Manager | API keys, Shopify credentials |
| Monitoring | Amazon CloudWatch | Logs, alarms, metrics |

The architecture is intentionally lightweight. Pay-per-use Lambda, entry-tier container hosting, managed database. The design prioritizes proving value at small scale before adding complexity.

---

## What Comes Next

The AI Store Coach vision from Week 3 is partially realized. Today, RojAI can evaluate products, score quality, and generate recommendations. The next steps move toward the full vision:

**Apply and measure.** Apply recommendations to listings and measure the impact — do improved titles lead to more search impressions? Do better tags correlate with higher click-through rates?

**Write operations.** Add the `write_products` scope with an approval flow. One-click application of recommendations with before/after tracking.

**Proactive monitoring.** Evolve the daily agent into a true coach — one that notifies me when a listing degrades, when new products are added without complete metadata, or when seasonal opportunities emerge.

**Bulk improvements.** Process the full catalog at once. Prioritize by score, batch recommendations, present a review queue.

**Offer it to others.** If the tool demonstrates value on my own store, the natural next step is making it available to other small Shopify merchants facing the same challenge.

---

## Conclusion

Four weeks ago, I built an AI listing generator for an AWS Builder Center challenge. Three weeks ago, I expanded it into an autonomous agent. Two weeks ago, I described the AI Store Coach I wanted to build. This week, that vision is deployed and running against my live Shopify store.

The technical distance from Week 1 to Week 4 was significant. OAuth, session management, deployment topology, API security, secrets management — none of this existed in the first submission. The AI pipeline was the easy part. Making it accessible through a native Shopify experience, secured and monitored and deployed reliably — that was the engineering work.

What made it worth doing was that I was building for myself. Every feature decision was grounded in a need I actually had: Can I see which listings are weak? Can I get specific suggestions? Can I trust those suggestions enough to use them?

I do not yet know whether the AI recommendations will measurably improve my store's search performance. That experiment is next. But for the first time, I have the infrastructure to run it — a scoring engine, a recommendation pipeline, and a clear way to compare before and after.

Each week's challenge added a layer. Week 1 gave me the AI pipeline. Week 2 gave me autonomous evaluation. Week 3 gave me the vision. Week 4 gave me the deployed application. Together, they produced something none of them could have alone.

This is not the end of a challenge project. It is the beginning of a longer journey — building practical AI tools that help small business owners compete in marketplaces designed for scale. RojAI started with one store and ten products. Where it goes next depends on whether the results match the promise. I intend to find out.

---

*Built with Amazon Bedrock, AWS Lambda, AWS CDK, Shopify App Bridge, React Router, Prisma, Kiro, and Render.*

*Source code: [github.com/roj-collective/RojAI](https://github.com/roj-collective/RojAI/tree/develop)*
