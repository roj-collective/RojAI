import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

interface ProductNode {
  id: string;
  title: string;
  status: string;
  totalInventory: number;
}

interface LoaderData {
  products: ProductNode[];
  productCount: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 25) {
          edges {
            node {
              id
              title
              status
              totalInventory
            }
          }
        }
      }`,
  );

  const responseJson = await response.json();
  const products: ProductNode[] =
    responseJson.data?.products?.edges?.map(
      (edge: { node: ProductNode }) => edge.node,
    ) ?? [];

  return { products, productCount: products.length } satisfies LoaderData;
};

export default function Index() {
  const { products, productCount } = useLoaderData<LoaderData>();

  return (
    <s-page heading="RojAI Agent">
      <s-section heading={`Products (${productCount})`}>
        <s-paragraph>
          Showing products from your store using the <code>read_products</code>{" "}
          scope.
        </s-paragraph>
        {products.length === 0 ? (
          <s-paragraph>No products found in this store.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product) => (
              <s-box
                key={product.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-text><strong>{product.title}</strong></s-text>
                <s-text>
                  {" "}— {product.status} | Inventory: {product.totalInventory}
                </s-text>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          RojAI Agent is an autonomous merchandising assistant that reviews
          product listings and generates AI-powered recommendations.
        </s-paragraph>
        <s-paragraph>
          <s-text>Scope: </s-text>
          <code>read_products</code>
        </s-paragraph>
        <s-paragraph>
          <s-text>Store: </s-text>
          Connected
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
