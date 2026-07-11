const FEATURES = [
  {
    icon: "✦",
    title: "Optimised Title",
    description: "Platform-specific product titles crafted to rank and convert.",
  },
  {
    icon: "≡",
    title: "Bullet Points",
    description: "Five compelling selling points that highlight key benefits.",
  },
  {
    icon: "¶",
    title: "Full Description",
    description: "Engaging copy tailored to your tone and marketplace.",
  },
  {
    icon: "#",
    title: "SEO Keywords",
    description: "Relevant search terms to improve discoverability.",
  },
  {
    icon: "◈",
    title: "Product Tags",
    description: "Ready-to-use tags for Shopify, Etsy, and Amazon.",
  },
];

export default function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__hero">
        <div className="empty-state__icon" aria-hidden="true">✦</div>
        <h2 className="empty-state__title">Your listing will appear here</h2>
        <p className="empty-state__text">
          Fill in the form and click{" "}
          <strong className="empty-state__cta-word">Generate Listing</strong> to
          receive AI-crafted marketplace copy in seconds.
        </p>
      </div>
      <div className="empty-state__features">
        {FEATURES.map(({ icon, title, description }) => (
          <div key={title} className="feature-card">
            <span className="feature-card__icon" aria-hidden="true">
              {icon}
            </span>
            <div>
              <p className="feature-card__title">{title}</p>
              <p className="feature-card__desc">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
