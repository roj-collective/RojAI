/**
 * HomePage.tsx — Public landing page for RojAI.
 *
 * Accessible without authentication. Explains the product, shows pricing,
 * and provides CTAs to register or sign in.
 */

import { useAuth } from "../auth";

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="home">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="home-hero">
        <h1 className="home-hero__title">
          AI-Powered Product Listings
          <br />
          <span className="home-hero__accent">in Seconds</span>
        </h1>
        <p className="home-hero__subtitle">
          RojAI helps small businesses and independent sellers turn basic product
          information into marketplace-ready titles, bullet points, descriptions,
          SEO keywords, and tags — for Shopify, Etsy, and Amazon.
        </p>
        <div className="home-hero__cta">
          {isAuthenticated ? (
            <>
              <a href="/app" className="btn btn--primary home-hero__btn">
                Open AI Listings
              </a>
              <a href="/history" className="btn btn--secondary home-hero__btn">
                View History
              </a>
            </>
          ) : (
            <>
              <a href="/auth" className="btn btn--primary home-hero__btn">
                Create a Free Account
              </a>
              <a href="/auth" className="btn btn--secondary home-hero__btn">
                Sign In
              </a>
            </>
          )}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section className="home-section">
        <h2 className="home-section__title">How It Works</h2>
        <div className="home-steps">
          <div className="home-step">
            <div className="home-step__number">1</div>
            <h3 className="home-step__title">Describe Your Product</h3>
            <p className="home-step__text">
              Enter your product name, a short description, category, and choose
              your marketplace and tone.
            </p>
          </div>
          <div className="home-step">
            <div className="home-step__number">2</div>
            <h3 className="home-step__title">Generate with AI</h3>
            <p className="home-step__text">
              Our AI creates an optimized title, five bullet points, a full
              description, SEO keywords, and product tags.
            </p>
          </div>
          <div className="home-step">
            <div className="home-step__number">3</div>
            <h3 className="home-step__title">Copy and Publish</h3>
            <p className="home-step__text">
              Review the output, copy each section, and paste into your
              marketplace dashboard. Done.
            </p>
          </div>
        </div>
      </section>

      {/* ── Example Output ───────────────────────────────────────────── */}
      <section className="home-section home-section--alt">
        <h2 className="home-section__title">Example Output</h2>
        <div className="home-example">
          <div className="home-example__input">
            <p className="home-example__label">You provide:</p>
            <p className="home-example__text">
              <strong>Product:</strong> Handwoven Kilim Pillow<br />
              <strong>Description:</strong> Decorative pillow made from handwoven kilim fabric<br />
              <strong>Category:</strong> Home &amp; Kitchen<br />
              <strong>Marketplace:</strong> Shopify
            </p>
          </div>
          <div className="home-example__output">
            <p className="home-example__label">RojAI generates:</p>
            <p className="home-example__generated-title">
              Handwoven Kilim Pillow — Decorative Kilim Fabric Cushion for Living Rooms and Bedrooms | Home &amp; Kitchen
            </p>
            <ul className="home-example__bullets">
              <li>Decorative pillow crafted from handwoven kilim fabric</li>
              <li>Adds texture and visual interest to sofas, chairs, and beds</li>
              <li>Handwoven construction gives each piece a distinctive look</li>
              <li>A statement accent for living rooms, bedrooms, and reading nooks</li>
              <li>Makes a thoughtful gift for anyone who appreciates handwoven textiles</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Supported Platforms ───────────────────────────────────────── */}
      <section className="home-section">
        <h2 className="home-section__title">Built for Your Marketplace</h2>
        <div className="home-features">
          <div className="home-feature">
            <h4 className="home-feature__title">Marketplaces</h4>
            <p className="home-feature__text">Shopify, Etsy, Amazon</p>
          </div>
          <div className="home-feature">
            <h4 className="home-feature__title">Languages</h4>
            <p className="home-feature__text">English, French, German, Spanish, Italian</p>
          </div>
          <div className="home-feature">
            <h4 className="home-feature__title">Tones</h4>
            <p className="home-feature__text">Professional, Luxury, Friendly</p>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="home-section home-section--alt" id="pricing">
        <h2 className="home-section__title">Simple Pricing</h2>
        <div className="home-pricing">
          <div className="home-pricing__card home-pricing__card--free">
            <h3 className="home-pricing__plan">Free</h3>
            <p className="home-pricing__price">$0<span>/month</span></p>
            <ul className="home-pricing__features">
              <li>5 AI generations per month</li>
              <li>1 regeneration per listing</li>
              <li>All marketplaces and languages</li>
              <li>Copy-ready output</li>
              <li>Recent history (stored locally)</li>
            </ul>
            {isAuthenticated ? (
              <a href="/app" className="btn btn--primary home-pricing__btn">
                Open AI Listings
              </a>
            ) : (
              <a href="/auth" className="btn btn--primary home-pricing__btn">
                Get Started Free
              </a>
            )}
          </div>
          <div className="home-pricing__card home-pricing__card--seller">
            <span className="home-pricing__badge">Coming Soon</span>
            <h3 className="home-pricing__plan">Seller</h3>
            <p className="home-pricing__price">$9<span>/month</span></p>
            <ul className="home-pricing__features">
              <li>100 AI generations per month</li>
              <li>3 regenerations per listing</li>
              <li>Server-synced listing history</li>
              <li>Brand-voice settings</li>
              <li>Platform-specific optimization</li>
              <li>SEO titles, meta descriptions, and tags</li>
            </ul>
            <button className="btn btn--secondary home-pricing__btn" disabled>
              Coming Soon
            </button>
          </div>
        </div>
      </section>

      {/* ── Founder ──────────────────────────────────────────────────── */}
      <section className="home-section">
        <h2 className="home-section__title">Why I Built RojAI</h2>
        <div className="home-founder">
          <p>
            I run a small e-commerce store selling handwoven rugs. Every product
            is unique, and every listing has to be written individually. The
            title, tags, and description all affect whether buyers find my
            products in search results.
          </p>
          <p>
            I built RojAI because writing optimized listings for Shopify, Etsy,
            and Amazon was one of the most time-consuming tasks in my business.
            Now AI handles the first draft, and I focus on sourcing great
            products and serving my customers.
          </p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="home-section home-section--alt" id="faq">
        <h2 className="home-section__title">FAQ</h2>
        <div className="home-faq">
          <details className="home-faq__item">
            <summary>Do I need a credit card to start?</summary>
            <p>No. The free plan gives you 5 AI generations per month with no payment required.</p>
          </details>
          <details className="home-faq__item">
            <summary>Which marketplaces are supported?</summary>
            <p>Shopify, Etsy, and Amazon. Each marketplace gets copy optimized for its search algorithms and buyer expectations.</p>
          </details>
          <details className="home-faq__item">
            <summary>Can I edit the generated listings?</summary>
            <p>Yes. RojAI produces a starting draft — you copy the output and edit as needed before publishing on your store.</p>
          </details>
          <details className="home-faq__item">
            <summary>Is my product data stored?</summary>
            <p>Your recent listing history is stored locally in your browser. Product descriptions are not permanently stored on our servers.</p>
          </details>
          <details className="home-faq__item">
            <summary>What AI powers RojAI?</summary>
            <p>RojAI uses Amazon Bedrock with foundation models configured for e-commerce copywriting.</p>
          </details>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="home-footer">
        <div className="home-footer__inner">
          <p className="home-footer__brand">RojAI</p>
          <nav className="home-footer__links">
            <a href="/privacy" className="home-footer__link">Privacy Policy (Draft)</a>
            <a href="/terms" className="home-footer__link">Terms of Service (Draft)</a>
          </nav>
          <p className="home-footer__copy">
            Built with Amazon Bedrock, AWS Lambda, and React.
          </p>
        </div>
      </footer>
    </div>
  );
}
