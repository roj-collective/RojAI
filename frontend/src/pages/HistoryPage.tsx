/**
 * HistoryPage.tsx — Shows the user's previously generated listings.
 *
 * In this first version, history is stored in localStorage (client-side)
 * because no DynamoDB history table has been provisioned yet.
 *
 * Design decision: localStorage is acceptable for Phase 1 because:
 * - It avoids adding another DynamoDB table before validating the feature
 * - History is per-device (cleared on browser reset), which is documented
 * - A future phase will add server-side history with GET /web/history
 *
 * Each listing is saved after a successful generation in GeneratorPage.
 */

import { useState } from "react";

export interface SavedListing {
  id: string;
  title: string;
  marketplace: string;
  category: string;
  createdAt: string;
  bulletPoints: string[];
  fullDescription: string;
  seoKeywords: string[];
  tags: string[];
}

const STORAGE_KEY = "rojai-listing-history";

export function getHistory(): SavedListing[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedListing[];
  } catch {
    return [];
  }
}

export function saveToHistory(listing: SavedListing): void {
  const history = getHistory();
  // Prepend new listing, limit to 50 most recent
  history.unshift(listing);
  if (history.length > 50) history.length = 50;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const [history] = useState<SavedListing[]>(getHistory);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const totalPages = Math.ceil(history.length / PAGE_SIZE);
  const pageItems = history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  if (history.length === 0) {
    return (
      <div className="history-page history-page--empty">
        <div className="history-empty">
          <div className="history-empty__icon" aria-hidden="true">📋</div>
          <h1 className="history-empty__title">No listings yet</h1>
          <p className="history-empty__text">
            Your AI-generated listings will appear here so you can revisit, copy, and reuse them anytime.
          </p>
          <a href="/" className="history-empty__cta">
            Create your first listing
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="history-header">
        <h1 className="history-header__title">Listing History</h1>
        <p className="history-header__subtitle">
          Your recent AI-generated listings ({history.length} total)
        </p>
      </div>

      <div className="history-list">
        {pageItems.map((item) => (
          <div key={item.id} className="history-card">
            <div
              className="history-card__header"
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              role="button"
              tabIndex={0}
              aria-expanded={expanded === item.id}
            >
              <div className="history-card__meta">
                <h3 className="history-card__title">{item.title}</h3>
                <div className="history-card__tags">
                  <span className="history-card__tag">{item.marketplace}</span>
                  <span className="history-card__tag">{item.category}</span>
                  <span className="history-card__date">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <span className="history-card__chevron">
                {expanded === item.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === item.id && (
              <div className="history-card__body">
                <div className="history-card__section">
                  <div className="history-card__section-header">
                    <strong>Title</strong>
                    <button
                      className="history-card__copy"
                      onClick={() => copyText(item.title, `title-${item.id}`)}
                    >
                      {copied === `title-${item.id}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p>{item.title}</p>
                </div>

                <div className="history-card__section">
                  <div className="history-card__section-header">
                    <strong>Bullet Points</strong>
                    <button
                      className="history-card__copy"
                      onClick={() =>
                        copyText(item.bulletPoints.map((b) => `• ${b}`).join("\n"), `bullets-${item.id}`)
                      }
                    >
                      {copied === `bullets-${item.id}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <ul className="history-card__bullets">
                    {item.bulletPoints.map((bp, i) => (
                      <li key={i}>{bp}</li>
                    ))}
                  </ul>
                </div>

                <div className="history-card__section">
                  <div className="history-card__section-header">
                    <strong>Description</strong>
                    <button
                      className="history-card__copy"
                      onClick={() => copyText(item.fullDescription, `desc-${item.id}`)}
                    >
                      {copied === `desc-${item.id}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p>{item.fullDescription}</p>
                </div>

                <div className="history-card__section">
                  <div className="history-card__section-header">
                    <strong>SEO Keywords</strong>
                    <button
                      className="history-card__copy"
                      onClick={() => copyText(item.seoKeywords.join(", "), `seo-${item.id}`)}
                    >
                      {copied === `seo-${item.id}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="history-card__keyword-list">
                    {item.seoKeywords.map((kw) => (
                      <span key={kw} className="history-card__keyword">{kw}</span>
                    ))}
                  </div>
                </div>

                <div className="history-card__section">
                  <div className="history-card__section-header">
                    <strong>Tags</strong>
                    <button
                      className="history-card__copy"
                      onClick={() => copyText(item.tags.join(", "), `tags-${item.id}`)}
                    >
                      {copied === `tags-${item.id}` ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="history-card__keyword-list">
                    {item.tags.map((tag) => (
                      <span key={tag} className="history-card__keyword">#{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="history-pagination">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="history-pagination__btn"
          >
            ← Previous
          </button>
          <span className="history-pagination__info">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="history-pagination__btn"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
