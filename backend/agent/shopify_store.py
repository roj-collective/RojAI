"""
agent/shopify_store.py — Shopify Admin GraphQL API store provider.

Reads credentials from AWS Secrets Manager and fetches products from the
Shopify Admin GraphQL API (version 2026-07) using the client credentials grant.

The secret (default name: rojai/shopify) must contain:
  - SHOPIFY_STORE_DOMAIN: e.g. "rojkilim.myshopify.com"
  - SHOPIFY_CLIENT_ID: the app's client ID
  - SHOPIFY_CLIENT_SECRET: the app's client secret

Authentication uses the client credentials grant (OAuth 2.0):
  POST https://{shop}/admin/oauth/access_token
  with grant_type=client_credentials, client_id, client_secret

The access token expires after 24 hours and is fetched fresh on each Lambda run.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError

import boto3

from .schemas import Product

logger = logging.getLogger(__name__)

# Shopify Admin GraphQL API version
SHOPIFY_API_VERSION = "2026-07"

# Maximum products per GraphQL page
PAGE_SIZE = 50

# GraphQL query for fetching products with cursor pagination
PRODUCTS_QUERY = """
query getProducts($first: Int!, $after: String) {
  products(first: $first, after: $after) {
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
        images(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""


class ShopifyStoreError(Exception):
    """Raised when Shopify store operations fail."""


def _get_secret(secret_name: str) -> dict[str, str]:
    """Retrieve and parse the Shopify secret from Secrets Manager."""
    client = boto3.client("secretsmanager")
    try:
        response = client.get_secret_value(SecretId=secret_name)
    except client.exceptions.ResourceNotFoundException:
        raise ShopifyStoreError(f"Secret '{secret_name}' not found in Secrets Manager.")
    except Exception as exc:
        raise ShopifyStoreError(f"Failed to retrieve secret '{secret_name}': {exc}")

    try:
        secret = json.loads(response["SecretString"])
    except (json.JSONDecodeError, KeyError) as exc:
        raise ShopifyStoreError(f"Failed to parse secret '{secret_name}': {exc}")

    return secret


def _validate_secret(secret: dict[str, str]) -> tuple[str, str, str]:
    """Validate required fields and return (shop_domain, client_id, client_secret)."""
    shop_domain = (
        secret.get("SHOPIFY_STORE_DOMAIN", "")
        or secret.get("shop_domain", "")
    ).strip()

    client_id = (
        secret.get("SHOPIFY_CLIENT_ID", "")
        or secret.get("client_id", "")
    ).strip()

    client_secret = (
        secret.get("SHOPIFY_CLIENT_SECRET", "")
        or secret.get("client_secret", "")
    ).strip()

    if not shop_domain:
        raise ShopifyStoreError(
            "Secret missing required field: 'SHOPIFY_STORE_DOMAIN'"
        )
    if not client_id:
        raise ShopifyStoreError(
            "Secret missing required field: 'SHOPIFY_CLIENT_ID'"
        )
    if not client_secret:
        raise ShopifyStoreError(
            "Secret missing required field: 'SHOPIFY_CLIENT_SECRET'"
        )

    # Ensure domain doesn't include protocol
    shop_domain = shop_domain.replace("https://", "").replace("http://", "").rstrip("/")

    return shop_domain, client_id, client_secret


def _obtain_access_token(shop_domain: str, client_id: str, client_secret: str) -> str:
    """
    Obtain an access token using the Shopify client credentials grant.

    POST https://{shop}/admin/oauth/access_token
    Body: client_id, client_secret, grant_type=client_credentials
    """
    url = f"https://{shop_domain}/admin/oauth/access_token"

    payload = urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "client_credentials",
    }).encode("utf-8")

    request = Request(url, data=payload, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urlopen(request, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            access_token = data.get("access_token", "")
            if not access_token:
                raise ShopifyStoreError(
                    f"Token response missing 'access_token'. Response: {data}"
                )
            logger.info(
                "Obtained Shopify access token (expires_in=%s, scopes=%s)",
                data.get("expires_in", "unknown"),
                data.get("scope", "unknown"),
            )
            return access_token
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise ShopifyStoreError(
            f"Failed to obtain access token (HTTP {exc.code}): {body[:500]}"
        )
    except URLError as exc:
        raise ShopifyStoreError(
            f"Network error obtaining access token: {exc.reason}"
        )
    except ShopifyStoreError:
        raise
    except Exception as exc:
        raise ShopifyStoreError(f"Unexpected error obtaining access token: {exc}")


def _graphql_request(
    shop_domain: str, access_token: str, query: str, variables: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Execute a GraphQL request against the Shopify Admin API."""
    url = f"https://{shop_domain}/admin/api/{SHOPIFY_API_VERSION}/graphql.json"

    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")

    request = Request(url, data=body, method="POST")
    request.add_header("X-Shopify-Access-Token", access_token)
    request.add_header("Content-Type", "application/json")

    try:
        with urlopen(request, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

            if "errors" in data and data["errors"]:
                error_messages = [e.get("message", str(e)) for e in data["errors"]]
                raise ShopifyStoreError(
                    f"GraphQL errors: {'; '.join(error_messages)}"
                )

            return data.get("data", {})
    except HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise ShopifyStoreError(
            f"Shopify GraphQL API error (HTTP {exc.code}): {body_text[:500]}"
        )
    except URLError as exc:
        raise ShopifyStoreError(f"Network error connecting to Shopify: {exc.reason}")
    except ShopifyStoreError:
        raise
    except Exception as exc:
        raise ShopifyStoreError(f"Unexpected error in GraphQL request: {exc}")


def _fetch_products_page(
    shop_domain: str, access_token: str, cursor: str | None = None
) -> tuple[list[dict[str, Any]], str | None]:
    """
    Fetch one page of products via GraphQL.

    Returns (product_nodes, next_cursor) where next_cursor is None
    if there are no more pages.
    """
    variables: dict[str, Any] = {"first": PAGE_SIZE}
    if cursor:
        variables["after"] = cursor

    data = _graphql_request(shop_domain, access_token, PRODUCTS_QUERY, variables)

    products_data = data.get("products", {})
    edges = products_data.get("edges", [])
    page_info = products_data.get("pageInfo", {})

    product_nodes = [edge["node"] for edge in edges]
    next_cursor = page_info.get("endCursor") if page_info.get("hasNextPage") else None

    return product_nodes, next_cursor


def _map_shopify_product(raw: dict[str, Any]) -> Product:
    """Map a Shopify GraphQL product node to our Product dataclass."""
    product_id = str(raw.get("id", ""))
    title = raw.get("title", "")
    description_html = raw.get("descriptionHtml", "") or ""
    description_plain = raw.get("description", "") or ""
    product_type = raw.get("productType", "") or "Uncategorized"
    vendor = raw.get("vendor", "") or None
    tags = raw.get("tags", []) or []
    seo = raw.get("seo", {}) or {}

    # Use plain description; fall back to stripped HTML
    description = description_plain if description_plain else _strip_html(description_html)

    # Build SEO keywords from tags (Shopify's equivalent of SEO keywords)
    # Tags serve as the discoverability mechanism on Shopify
    seo_keywords = list(tags)  # tags double as keywords for Shopify products

    return Product(
        product_id=product_id,
        product_name=title,
        description=description,
        category=product_type,
        marketplace="shopify",
        brand=vendor,
        current_title=title,
        current_bullet_points=[],  # Shopify does not have structured bullet points
        current_seo_keywords=seo_keywords,
        current_tags=tags,
    )


def _strip_html(html: str) -> str:
    """Naive HTML tag removal for product descriptions."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def get_all_products() -> list[Product]:
    """
    Fetch all active products from the Shopify store via GraphQL.

    Reads credentials from the secret specified by SHOPIFY_SECRET_NAME env var.
    Authenticates using the client credentials grant flow.
    Handles cursor-based pagination automatically.
    """
    secret_name = os.environ.get("SHOPIFY_SECRET_NAME", "rojai/shopify")

    logger.info("Fetching Shopify credentials from secret: %s", secret_name)
    secret = _get_secret(secret_name)
    shop_domain, client_id, client_secret = _validate_secret(secret)

    logger.info("Obtaining access token for store: %s", shop_domain)
    access_token = _obtain_access_token(shop_domain, client_id, client_secret)

    logger.info("Fetching products from Shopify store: %s (GraphQL API %s)", shop_domain, SHOPIFY_API_VERSION)

    all_products: list[Product] = []
    cursor: str | None = None
    page_count = 0

    while True:
        page_count += 1
        product_nodes, next_cursor = _fetch_products_page(
            shop_domain, access_token, cursor
        )

        if not product_nodes:
            break

        for raw in product_nodes:
            try:
                product = _map_shopify_product(raw)
                all_products.append(product)
            except Exception as exc:
                logger.warning(
                    "Skipping product %s due to mapping error: %s",
                    raw.get("id", "unknown"),
                    exc,
                )

        logger.info("Page %d: fetched %d products", page_count, len(product_nodes))

        if not next_cursor:
            break
        cursor = next_cursor

    logger.info("Total products fetched from Shopify: %d", len(all_products))
    return all_products
