"""
agent/shopify_store.py — Shopify Admin API store provider.

Reads credentials from AWS Secrets Manager and fetches products from the
Shopify Admin REST API using the client credentials grant flow.

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
from typing import Any
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError

import boto3

from .schemas import Product

logger = logging.getLogger(__name__)

# Shopify REST Admin API version
SHOPIFY_API_VERSION = "2024-10"

# Maximum products per page (Shopify limit is 250)
PAGE_LIMIT = 250


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


def _fetch_products_page(
    shop_domain: str, access_token: str, page_info: str | None = None
) -> tuple[list[dict[str, Any]], str | None]:
    """
    Fetch one page of products from Shopify Admin REST API.

    Returns (products_json, next_page_info) where next_page_info is None
    if there are no more pages.
    """
    base_url = f"https://{shop_domain}/admin/api/{SHOPIFY_API_VERSION}/products.json"

    if page_info:
        url = f"{base_url}?limit={PAGE_LIMIT}&page_info={page_info}"
    else:
        url = f"{base_url}?limit={PAGE_LIMIT}&status=active"

    request = Request(url, method="GET")
    request.add_header("X-Shopify-Access-Token", access_token)
    request.add_header("Content-Type", "application/json")

    try:
        with urlopen(request, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            # Parse Link header for cursor-based pagination
            link_header = resp.getheader("Link", "")
            next_page = _parse_next_page_info(link_header)
            return data.get("products", []), next_page
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise ShopifyStoreError(
            f"Shopify API error {exc.code}: {exc.reason}. Body: {body[:500]}"
        )
    except URLError as exc:
        raise ShopifyStoreError(f"Network error connecting to Shopify: {exc.reason}")
    except Exception as exc:
        raise ShopifyStoreError(f"Unexpected error fetching products: {exc}")


def _parse_next_page_info(link_header: str) -> str | None:
    """Extract page_info for the next page from Shopify's Link header."""
    if not link_header:
        return None

    # Link header format: <url?page_info=XYZ>; rel="next"
    for part in link_header.split(","):
        if 'rel="next"' in part:
            # Extract URL between < and >
            start = part.find("<")
            end = part.find(">")
            if start != -1 and end != -1:
                url = part[start + 1 : end]
                # Extract page_info parameter
                for param in url.split("?")[-1].split("&"):
                    if param.startswith("page_info="):
                        return param.split("=", 1)[1]
    return None


def _map_shopify_product(raw: dict[str, Any]) -> Product:
    """Map a Shopify product JSON object to our Product dataclass."""
    product_id = str(raw.get("id", ""))
    title = raw.get("title", "")
    body_html = raw.get("body_html", "") or ""
    product_type = raw.get("product_type", "") or "Uncategorized"
    vendor = raw.get("vendor", "") or None
    tags_str = raw.get("tags", "") or ""

    # Shopify tags are comma-separated
    tags = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else []

    # Use the product title as the product_name and current_title
    # body_html serves as the description (strip basic HTML for readability)
    description = _strip_html(body_html)

    return Product(
        product_id=product_id,
        product_name=title,
        description=description,
        category=product_type,
        marketplace="shopify",
        brand=vendor,
        current_title=title,
        current_bullet_points=[],  # Shopify doesn't have bullet points natively
        current_seo_keywords=[],   # Would need metafields for SEO keywords
        current_tags=tags,
    )


def _strip_html(html: str) -> str:
    """Naive HTML tag removal for product descriptions."""
    import re
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def get_all_products() -> list[Product]:
    """
    Fetch all active products from the Shopify store.

    Reads credentials from the secret specified by SHOPIFY_SECRET_NAME env var.
    Authenticates using the client credentials grant flow.
    Handles pagination automatically.
    """
    secret_name = os.environ.get("SHOPIFY_SECRET_NAME", "rojai/shopify")

    logger.info("Fetching Shopify credentials from secret: %s", secret_name)
    secret = _get_secret(secret_name)
    shop_domain, client_id, client_secret = _validate_secret(secret)

    logger.info("Obtaining access token for store: %s", shop_domain)
    access_token = _obtain_access_token(shop_domain, client_id, client_secret)

    logger.info("Fetching products from Shopify store: %s", shop_domain)

    all_products: list[Product] = []
    page_info: str | None = None
    page_count = 0

    while True:
        page_count += 1
        products_json, next_page_info = _fetch_products_page(
            shop_domain, access_token, page_info
        )

        if not products_json:
            break

        for raw in products_json:
            try:
                product = _map_shopify_product(raw)
                all_products.append(product)
            except Exception as exc:
                logger.warning(
                    "Skipping product %s due to mapping error: %s",
                    raw.get("id", "unknown"),
                    exc,
                )

        logger.info("Page %d: fetched %d products", page_count, len(products_json))

        if not next_page_info:
            break
        page_info = next_page_info

    logger.info("Total products fetched from Shopify: %d", len(all_products))
    return all_products
