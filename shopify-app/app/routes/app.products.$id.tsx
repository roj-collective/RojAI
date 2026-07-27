import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  evaluateProduct,
  RECOMMENDATION_THRESHOLD,
  type ShopifyProduct,
  type Finding,
} from "../lib/quality-scorer";
import { ScoreBadge } from "../components/ScoreBadge";
import { FindingsList } from "../components/FindingsList";
import { ProductDetails } from "../components/ProductDetails";

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  vendor: string;
  productType: string;
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
          productType
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
    productType: raw.productType,
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

export default function ProductDetailPage() {
  const { product, score, findings, needsRecommendations } =
    useLoaderData<LoaderData>();

  const detailFields = [
    { label: "Status", value: product.status },
    { label: "Vendor", value: product.vendor || "(not set)" },
    { label: "Product type", value: product.productType || "(not set)" },
    {
      label: "Tags",
      value: product.tags.length > 0 ? product.tags.join(", ") : "(none)",
    },
    { label: "Images", value: product.imageCount },
    { label: "Variants", value: product.variantCount },
    { label: "Inventory", value: product.totalInventory },
    { label: "Description", value: product.description || "(empty)" },
    { label: "SEO title", value: product.seoTitle || "(not set)" },
    {
      label: "SEO description",
      value: product.seoDescription || "(not set)",
    },
  ];

  return (
    <s-page heading={product.title}>
      <s-section heading="Product quality score">
        <s-stack direction="inline" gap="base">
          <ScoreBadge score={score} showLabel />
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
        <ProductDetails fields={detailFields} />
      </s-section>

      <FindingsList findings={findings} />

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
