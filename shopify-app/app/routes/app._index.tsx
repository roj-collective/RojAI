import { useState, useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
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
        }
      }`,
  );

  const responseJson = await response.json();
  const rawProducts: ShopifyProduct[] =
    responseJson.data?.products?.edges?.map(
      (edge: { node: ShopifyProduct }) => edge.node,
    ) ?? [];

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
    summary: { total: products.length, good, needsAttention, averageScore },
  } satisfies LoaderData;
};

export default function Dashboard() {
  const { products, summary } = useLoaderData<LoaderData>();

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

  return (
    <s-page heading="RojAI Agent — Product Quality Dashboard">
      <s-section heading="Overview">
        <MetricRow>
          <MetricCard value={summary.total} label="products" />
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
