import type { ScoredProduct } from "../lib/quality-scorer";
import { ScoreBadge } from "./ScoreBadge";

interface ProductCardProps {
  product: ScoredProduct;
}

/**
 * Displays a product in the dashboard list with its quality score,
 * title (as a link to the detail page), status, and quick stats.
 */
export function ProductCard({ product }: ProductCardProps) {
  const { quality } = product;

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="inline" gap="base">
        <s-box>
          <ScoreBadge score={quality.score} />
        </s-box>
        <s-box>
          <s-link href={`/app/products/${encodeURIComponent(product.id)}`}>
            {product.title}
          </s-link>
          <s-text>
            {" "}— {product.status} | {product.imageCount} images |{" "}
            {product.tags.length} tags
          </s-text>
          {quality.needsRecommendations && (
            <s-text>
              {" "}| {quality.findings.length} issue
              {quality.findings.length !== 1 ? "s" : ""}
            </s-text>
          )}
        </s-box>
      </s-stack>
    </s-box>
  );
}
