import { useState, useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  scoreProduct,
  getScoreBadge,
  RECOMMENDATION_THRESHOLD,
  type ShopifyProduct,
  type ScoredProduct,
} from "../lib/quality-scorer";

interface LoaderData {
  products: ScoredProduct[];
  summary: {
    total: number;
    good: number;
    needsAttention: number;
    averageScore: number;
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 50, sortKey: TITLE) {
          edges {
            node {
              id
              title
              description
              descriptionHtml
              status
              vendor
              tags
              totalInventory
              seo {
                title
                description
              }
              images(first: 10) {
                edges {
                  node {
                    id
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        }
      }`,
  );

  const responseJson = await response.json();
  const rawProducts: ShopifyProduct[] =
    responseJson.data?.products?.edges?.map(
      (edge: { node: ShopifyProduct }) => edge.node,
    ) ?? [];

  const products = rawProducts.map(scoreProduct);

  const good = products.filter((p) => p.quality.score >= RECOMMENDATION_THRESHOLD).length;
  const needsAttention = products.filter((p) => p.quality.score < RECOMMENDATION_THRESHOLD).length;
  const averageScore =
    products.length > 0
      ? Math.round(
          products.reduce((sum, p) => sum + p.quality.score, 0) /
            products.length,
        )
      : 0;

  return {
    products,
    summary: { total: products.length, good, needsAttention, averageScore },
  } satisfies LoaderData;
};

type StatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED";
type QualityFilter = "ALL" | "GOOD" | "NEEDS_ATTENTION";

export default function Dashboard() {
  const { products, summary } = useLoaderData<LoaderData>();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("ALL");

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(query),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (qualityFilter === "GOOD") {
      result = result.filter((p) => p.quality.score >= RECOMMENDATION_THRESHOLD);
    } else if (qualityFilter === "NEEDS_ATTENTION") {
      result = result.filter((p) => p.quality.score < RECOMMENDATION_THRESHOLD);
    }

    result.sort((a, b) => a.quality.score - b.quality.score);
    return result;
  }, [products, search, statusFilter, qualityFilter]);

  const hasFilters = search.trim() !== "" || statusFilter !== "ALL" || qualityFilter !== "ALL";

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setQualityFilter("ALL");
  };

  return (
    <s-page heading="RojAI Agent — Product Quality Dashboard">
      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text><strong>{summary.total}</strong> products</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text><strong>{summary.averageScore}</strong>/100 avg quality</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text><strong>{summary.good}</strong> good</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text><strong>{summary.needsAttention}</strong> need attention</s-text>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Filters">
        <s-stack direction="block" gap="base">
          <s-box>
            <label>
              <s-text>Search by title: </s-text>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to filter products..."
                style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc", width: "300px" }}
              />
            </label>
          </s-box>
          <s-stack direction="inline" gap="base">
            <s-box>
              <label>
                <s-text>Status: </s-text>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc" }}
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </s-box>
            <s-box>
              <label>
                <s-text>Quality: </s-text>
                <select
                  value={qualityFilter}
                  onChange={(e) => setQualityFilter(e.target.value as QualityFilter)}
                  style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc" }}
                >
                  <option value="ALL">All quality levels</option>
                  <option value="GOOD">Good (≥{RECOMMENDATION_THRESHOLD})</option>
                  <option value="NEEDS_ATTENTION">Needs attention (&lt;{RECOMMENDATION_THRESHOLD})</option>
                </select>
              </label>
            </s-box>
            {hasFilters && (
              <s-box>
                <s-button variant="tertiary" onClick={resetFilters}>
                  Clear filters
                </s-button>
              </s-box>
            )}
          </s-stack>
          {hasFilters && (
            <s-text>
              Showing {filteredProducts.length} of {products.length} products
            </s-text>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Product Listings">
        {filteredProducts.length === 0 ? (
          <s-paragraph>
            {products.length === 0
              ? "No products found in this store."
              : "No products match the current filters."}
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {filteredProducts.map((product) => {
              const badge = getScoreBadge(product.quality.score);
              return (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="base">
                    <s-box>
                      <s-badge tone={badge.tone}>
                        {product.quality.score}/100
                      </s-badge>
                    </s-box>
                    <s-box>
                      <s-link href={`/app/products/${encodeURIComponent(product.id)}`}>
                        {product.title}
                      </s-link>
                      <s-text>
                        {" "}— {product.status} | {product.imageCount} images |{" "}
                        {product.tags.length} tags
                      </s-text>
                      {product.quality.needsRecommendations && (
                        <s-text>
                          {" "}| {product.quality.findings.length} issue
                          {product.quality.findings.length !== 1 ? "s" : ""}
                        </s-text>
                      )}
                    </s-box>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="About scoring">
        <s-paragraph>
          Product quality score rates listings 0–100 based on title length,
          description completeness, tags, images, SEO metadata, vendor info, and
          listing status.
        </s-paragraph>
        <s-paragraph>
          Products scoring below {RECOMMENDATION_THRESHOLD} are flagged as
          needing attention.
        </s-paragraph>
        <s-paragraph>
          <s-text>Scope: </s-text>
          <code>read_products</code> (read-only)
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
