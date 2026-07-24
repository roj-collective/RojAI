import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  evaluateProduct,
  getScoreBadge,
  RECOMMENDATION_THRESHOLD,
  type ShopifyProduct,
  type Finding,
  type BadgeTone,
} from "../lib/quality-scorer";

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  vendor: string;
  tags: string[];
  totalInventory: number;
  imageCount: number;
  variantCount: number;
  seoTitle: string;
  seoDescription: string;
  createdAt: string;
  updatedAt: string;
}

interface LoaderData {
  product: ProductDetail;
  score: number;
  findings: Finding[];
  needsRecommendations: boolean;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const productId = decodeURIComponent(params.id || "");

  const response = await admin.graphql(
    `#graphql
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          description
          descriptionHtml
          status
          vendor
          tags
          totalInventory
          createdAt
          updatedAt
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
      }`,
    { variables: { id: productId } },
  );

  const responseJson = await response.json();
  const raw = responseJson.data?.product as
    | (ShopifyProduct & { createdAt: string; updatedAt: string })
    | null;

  if (!raw) {
    throw new Response("Product not found", { status: 404 });
  }

  const quality = evaluateProduct(raw);

  const product: ProductDetail = {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    status: raw.status,
    vendor: raw.vendor,
    tags: raw.tags,
    totalInventory: raw.totalInventory,
    imageCount: raw.images.edges.length,
    variantCount: raw.variants.edges.length,
    seoTitle: raw.seo?.title || "",
    seoDescription: raw.seo?.description || "",
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };

  return {
    product,
    score: quality.score,
    findings: quality.findings,
    needsRecommendations: quality.needsRecommendations,
  } satisfies LoaderData;
};

function findingTone(severity: string): BadgeTone {
  if (severity === "critical" || severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "info";
}

export default function ProductDetailPage() {
  const { product, score, findings, needsRecommendations } =
    useLoaderData<LoaderData>();
  const badge = getScoreBadge(score);

  return (
    <s-page heading={product.title}>
      <s-section heading="Product quality score">
        <s-stack direction="inline" gap="base">
          <s-badge tone={badge.tone}>
            {score}/100 — {badge.label}
          </s-badge>
          {needsRecommendations && (
            <s-text>
              Below threshold ({RECOMMENDATION_THRESHOLD}). Recommendations
              suggested.
            </s-text>
          )}
        </s-stack>
        <s-paragraph>
          <s-link href="/app">← Back to dashboard</s-link>
        </s-paragraph>
      </s-section>

      <s-section heading="Product details">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>Status:</strong> {product.status}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>Vendor:</strong> {product.vendor || "(not set)"}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>Tags:</strong>{" "}
              {product.tags.length > 0 ? product.tags.join(", ") : "(none)"}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>Images:</strong> {product.imageCount}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>Variants:</strong> {product.variantCount}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>Inventory:</strong> {product.totalInventory}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>Description:</strong>{" "}
              {product.description || "(empty)"}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>SEO title:</strong>{" "}
              {product.seoTitle || "(not set)"}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text>
              <strong>SEO description:</strong>{" "}
              {product.seoDescription || "(not set)"}
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      {findings.length > 0 && (
        <s-section heading={`Findings (${findings.length})`}>
          <s-stack direction="block" gap="base">
            {findings.map((finding, i) => (
              <s-box
                key={i}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base">
                  <s-badge tone={findingTone(finding.severity)}>
                    {finding.severity.toUpperCase()}
                  </s-badge>
                  <s-text>
                    <strong>{finding.field}:</strong> {finding.message} (−
                    {finding.pointsDeducted} pts)
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}

      {findings.length === 0 && (
        <s-section heading="Findings">
          <s-paragraph>
            No quality issues found. This product listing meets all criteria.
          </s-paragraph>
        </s-section>
      )}

      <s-section slot="aside" heading="Metadata">
        <s-paragraph>
          <s-text>
            <strong>Created:</strong>{" "}
            {new Date(product.createdAt).toLocaleDateString()}
          </s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>
            <strong>Updated:</strong>{" "}
            {new Date(product.updatedAt).toLocaleDateString()}
          </s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>
            <strong>ID:</strong>
          </s-text>{" "}
          <code>{product.id.replace("gid://shopify/Product/", "")}</code>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
