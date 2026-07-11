import type { GeneratedListing } from "../types/listing";

interface ListingResultsProps {
  listing: GeneratedListing;
}

function CopyButton({ text }: { text: string }) {
  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {
      /* silently ignore — clipboard API may be unavailable in some envs */
    });
  }
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      Copy
    </button>
  );
}

function ResultSection({
  label,
  children,
  copyText,
}: {
  label: string;
  children: React.ReactNode;
  copyText: string;
}) {
  return (
    <section className="result-section">
      <div className="result-section__header">
        <h3 className="result-section__title">{label}</h3>
        <CopyButton text={copyText} />
      </div>
      <div className="result-section__body">{children}</div>
    </section>
  );
}

export default function ListingResults({ listing }: ListingResultsProps) {
  const { title, bulletPoints, fullDescription, seoKeywords, tags } = listing;

  return (
    <div className="listing-results">
      <div className="listing-results__header">
        <span className="listing-results__badge">AI Generated</span>
        <h2 className="listing-results__heading">Your Optimised Listing</h2>
        <p className="listing-results__subtext">
          Review and copy each section into your marketplace dashboard.
        </p>
      </div>

      {/* Title */}
      <ResultSection label="Optimised Product Title" copyText={title}>
        <p className="result-title-text">{title}</p>
      </ResultSection>

      {/* Bullet Points */}
      <ResultSection
        label="Key Bullet Points"
        copyText={bulletPoints.map((b) => `• ${b}`).join("\n")}
      >
        <ul className="result-bullets">
          {bulletPoints.map((point, i) => (
            <li key={i} className="result-bullet">
              <span className="bullet-marker" aria-hidden="true">•</span>
              {point}
            </li>
          ))}
        </ul>
      </ResultSection>

      {/* Full Description */}
      <ResultSection label="Full Product Description" copyText={fullDescription}>
        <p className="result-description">{fullDescription}</p>
      </ResultSection>

      {/* SEO Keywords */}
      <ResultSection label="SEO Keywords" copyText={seoKeywords.join(", ")}>
        <div className="result-tags">
          {seoKeywords.map((kw) => (
            <span key={kw} className="tag tag--keyword">
              {kw}
            </span>
          ))}
        </div>
      </ResultSection>

      {/* Product Tags */}
      <ResultSection label="Product Tags" copyText={tags.join(", ")}>
        <div className="result-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag tag--product">
              #{tag}
            </span>
          ))}
        </div>
      </ResultSection>
    </div>
  );
}
