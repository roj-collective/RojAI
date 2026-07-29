import { useState, useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  scoreProduct,
  RECOMMENDATION_THRESHOLD,
  type ShopifyProduct,
  type ScoredProduct,
} from "../lib/quality-scorer";
import { MetricCard, MetricRow } from "../components/MetricCard";
import { ProductCard } from "../components/ProductCard";
import {
  FilterBar,
  type StatusFilter,
  type QualityFilter,
} from "../components/FilterBar";

const PAGE_SIZE = 50;

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

interface LoaderData {
  products: ScoredProduct[];
  pageInfo: PageInfo;
  summary: {
    total: number;
    good: number;
    needsAttention: number;
    averageScore: number;
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");

  // Build pagination variables: forward (after) or backward (before)
  let paginationArgs: string;
  let variables: Record<string, unknown> = {};

  if (before) {
    paginationArgs = `last: ${PAGE_SIZE}, before: $before`;
    variables = { before };
  } else if (after) {
    paginationArgs = `first: ${PAGE_SIZE}, after: $after`;
    variables = { after };
  } else {
    paginationArgs = `first: ${PAGE_SIZE}`;
  }

  // Build the query with dynamic pagination direction
  const variableDefs = before
    ? "($before: String)"
    : after
      ? "($after: String)"
      : "";

  const query = `#graphql
    query getProducts${variableDefs} {
      products(${paginationArgs}, sortKey: TITLE) {
        edges {
          node {
            id
            title
            description
            descriptionHtml
            status
            vendor
            productType
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
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }`;

  const response = await admin.graphql(query, { variables });
  const responseJson = await response.json();

  const edges = responseJson.data?.products?.edges ?? [];
  const pageInfo: PageInfo = responseJson.data?.products?.pageInfo ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  };

  const rawProducts: ShopifyProduct[] = edges.map(
    (edge: { node: ShopifyProduct }) => edge.node,
  );

  const products = rawProducts.map(scoreProduct);

  const good = products.filter(
    (p) => p.quality.score >= RECOMMENDATION_THRESHOLD,
  ).length;
  const needsAttention = products.filter(
    (p) => p.quality.score < RECOMMENDATION_THRESHOLD,
  ).length;
  const averageScore =
    products.length > 0
      ? Math.round(
          products.reduce((sum, p) => sum + p.quality.score, 0) /
            products.length,
        )
      : 0;

  return {
    products,
    pageInfo,
    summary: { total: products.length, good, needsAttention, averageScore },
  } satisfies LoaderData;
};

export default function Dashboard() {
  const { products, pageInfo, summary } = useLoaderData<LoaderData>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("ALL");

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(query));
    }

    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (qualityFilter === "GOOD") {
      result = result.filter(
        (p) => p.quality.score >= RECOMMENDATION_THRESHOLD,
      );
    } else if (qualityFilter === "NEEDS_ATTENTION") {
      result = result.filter(
        (p) => p.quality.score < RECOMMENDATION_THRESHOLD,
      );
    }

    result.sort((a, b) => a.quality.score - b.quality.score);
    return result;
  }, [products, search, statusFilter, qualityFilter]);

  const hasFilters =
    search.trim() !== "" ||
    statusFilter !== "ALL" ||
    qualityFilter !== "ALL";

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setQualityFilter("ALL");
  };

  const goToNextPage = () => {
    if (pageInfo.endCursor) {
      navigate(`/app?after=${encodeURIComponent(pageInfo.endCursor)}`);
    }
  };

  const goToPreviousPage = () => {
    if (pageInfo.startCursor) {
      navigate(`/app?before=${encodeURIComponent(pageInfo.startCursor)}`);
    }
  };

  const isFirstPage = !searchParams.has("after") && !searchParams.has("before");

  return (
    <s-page heading="RojAI Agent — Product Quality Dashboard">
      <s-section heading="Overview">
        <MetricRow>
          <MetricCard value={summary.total} label="products (this page)" />
          <MetricCard value={`${summary.averageScore}/100`} label="avg quality" />
          <MetricCard value={summary.good} label="good" />
          <MetricCard value={summary.needsAttention} label="need attention" />
        </MetricRow>
      </s-section>

      <s-section heading="Filters">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          qualityFilter={qualityFilter}
          onQualityChange={setQualityFilter}
          hasFilters={hasFilters}
          onClear={resetFilters}
          filteredCount={filteredProducts.length}
          totalCount={products.length}
        />
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
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </s-stack>
        )}

        {/* Pagination controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid var(--color-border, #e1e3e5)",
          }}
        >
          <button
            type="button"
            onClick={goToPreviousPage}
            disabled={isFirstPage && !pageInfo.hasPreviousPage}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid var(--color-border, #c9cccf)",
              backgroundColor: "var(--color-surface, #fff)",
              color: "var(--color-text, #202223)",
              fontWeight: 500,
              fontSize: "14px",
              cursor:
                isFirstPage && !pageInfo.hasPreviousPage
                  ? "not-allowed"
                  : "pointer",
              opacity:
                isFirstPage && !pageInfo.hasPreviousPage ? 0.5 : 1,
            }}
          >
            ← Previous
          </button>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={!pageInfo.hasNextPage}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid var(--color-border, #c9cccf)",
              backgroundColor: "var(--color-surface, #fff)",
              color: "var(--color-text, #202223)",
              fontWeight: 500,
              fontSize: "14px",
              cursor: !pageInfo.hasNextPage ? "not-allowed" : "pointer",
              opacity: !pageInfo.hasNextPage ? 0.5 : 1,
            }}
          >
            Next →
          </button>
        </div>
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
