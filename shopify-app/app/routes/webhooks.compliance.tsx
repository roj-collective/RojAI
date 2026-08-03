/**
 * webhooks.compliance.tsx — Mandatory GDPR/privacy compliance webhook handler.
 *
 * Handles three Shopify-required compliance topics:
 * - CUSTOMERS_DATA_REQUEST: Acknowledge; RojAI stores no customer data.
 * - CUSTOMERS_REDACT: Acknowledge; RojAI stores no customer data.
 * - SHOP_REDACT: Delete all shop-associated records (sessions).
 *
 * Authentication: Shopify's HMAC signature is verified by authenticate.webhook().
 * Invalid signatures result in a thrown 401 Response before this handler executes.
 *
 * Security: No payload contents, tokens, or customer data are logged.
 */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // RojAI does not store customer data beyond Shopify session metadata.
      // Acknowledge the request. No data to export.
      console.log(
        "compliance/customers_data_request | shop=%s | action=acknowledged_no_customer_data",
        shop,
      );
      return new Response("No customer data stored", { status: 200 });
    }

    case "CUSTOMERS_REDACT": {
      // RojAI does not store customer data.
      // Acknowledge the request. No data to delete.
      console.log(
        "compliance/customers_redact | shop=%s | action=acknowledged_no_customer_data",
        shop,
      );
      return new Response("No customer data stored", { status: 200 });
    }

    case "SHOP_REDACT": {
      // Delete ALL records associated with this shop.
      // Currently: Session records only.
      // Idempotent: deleteMany returns 0 if no records exist.
      const result = await db.session.deleteMany({ where: { shop } });
      console.log(
        "compliance/shop_redact | shop=%s | sessions_deleted=%d",
        shop,
        result.count,
      );
      return new Response("Shop data deleted", { status: 200 });
    }

    default: {
      console.log(
        "compliance/unknown_topic | shop=%s | topic=%s",
        shop,
        topic,
      );
      return new Response("Unhandled compliance topic", { status: 404 });
    }
  }
};
