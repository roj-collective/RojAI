"""
Tests for agent/shopify_store.py — Shopify GraphQL store provider.
"""
from __future__ import annotations

import json
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from agent.shopify_store import (
    _map_shopify_product,
    _fetch_products_page,
    _graphql_request,
    _validate_secret,
    _strip_html,
    ShopifyStoreError,
    SHOPIFY_API_VERSION,
)
from agent.schemas import Product


# ── Product mapping ──────────────────────────────────────────────────────────

class TestMapShopifyProduct:
    def test_maps_complete_product(self):
        raw = {
            "id": "gid://shopify/Product/12345",
            "title": "Handwoven Kilim Rug",
            "description": "A beautiful handwoven kilim rug.",
            "descriptionHtml": "<p>A beautiful handwoven kilim rug.</p>",
            "status": "ACTIVE",
            "vendor": "RojKilim",
            "productType": "Home & Kitchen",
            "tags": ["kilim", "rug", "handwoven"],
            "totalInventory": 5,
            "seo": {"title": "SEO Title", "description": "SEO desc"},
            "images": {"edges": [{"node": {"id": "img1"}}]},
        }
        product = _map_shopify_product(raw)

        assert isinstance(product, Product)
        assert product.product_id == "gid://shopify/Product/12345"
        assert product.product_name == "Handwoven Kilim Rug"
        assert product.description == "A beautiful handwoven kilim rug."
        assert product.marketplace == "shopify"
        assert product.brand == "RojKilim"
        assert product.category == "Home & Kitchen"
        assert product.current_tags == ["kilim", "rug", "handwoven"]
        assert product.current_seo_keywords == ["kilim", "rug", "handwoven"]
        assert product.current_bullet_points == []

    def test_maps_product_with_missing_fields(self):
        raw = {
            "id": "gid://shopify/Product/99",
            "title": "Minimal Product",
            "description": "",
            "descriptionHtml": "",
            "status": "DRAFT",
            "vendor": "",
            "productType": "",
            "tags": [],
            "totalInventory": 0,
            "seo": None,
            "images": {"edges": []},
        }
        product = _map_shopify_product(raw)

        assert product.product_id == "gid://shopify/Product/99"
        assert product.description == ""
        assert product.brand is None
        assert product.category == "Uncategorized"
        assert product.current_tags == []
        assert product.current_seo_keywords == []

    def test_falls_back_to_stripped_html_when_description_empty(self):
        raw = {
            "id": "gid://shopify/Product/1",
            "title": "Test",
            "description": "",
            "descriptionHtml": "<p>HTML <b>description</b></p>",
            "status": "ACTIVE",
            "vendor": "V",
            "productType": "Cat",
            "tags": [],
            "totalInventory": 0,
            "seo": None,
            "images": {"edges": []},
        }
        product = _map_shopify_product(raw)
        assert product.description == "HTML description"


# ── GraphQL pagination ───────────────────────────────────────────────────────

class TestFetchProductsPage:
    @patch("agent.shopify_store.urlopen")
    def test_returns_products_and_next_cursor(self, mock_urlopen):
        response_data = {
            "data": {
                "products": {
                    "edges": [
                        {"node": {"id": "p1", "title": "Product 1"}, "cursor": "c1"},
                        {"node": {"id": "p2", "title": "Product 2"}, "cursor": "c2"},
                    ],
                    "pageInfo": {"hasNextPage": True, "endCursor": "c2"},
                }
            }
        }
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(response_data).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        products, next_cursor = _fetch_products_page("test.myshopify.com", "token123")

        assert len(products) == 2
        assert products[0]["id"] == "p1"
        assert next_cursor == "c2"

    @patch("agent.shopify_store.urlopen")
    def test_returns_none_cursor_when_no_next_page(self, mock_urlopen):
        response_data = {
            "data": {
                "products": {
                    "edges": [{"node": {"id": "p1"}, "cursor": "c1"}],
                    "pageInfo": {"hasNextPage": False, "endCursor": "c1"},
                }
            }
        }
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(response_data).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        products, next_cursor = _fetch_products_page("test.myshopify.com", "token")

        assert len(products) == 1
        assert next_cursor is None

    @patch("agent.shopify_store.urlopen")
    def test_passes_cursor_for_subsequent_pages(self, mock_urlopen):
        response_data = {
            "data": {
                "products": {
                    "edges": [],
                    "pageInfo": {"hasNextPage": False, "endCursor": None},
                }
            }
        }
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(response_data).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        _fetch_products_page("test.myshopify.com", "token", cursor="abc123")

        call_args = mock_urlopen.call_args[0][0]
        body = json.loads(call_args.data.decode())
        assert body["variables"]["after"] == "abc123"


# ── GraphQL error handling ───────────────────────────────────────────────────

class TestGraphQLErrors:
    @patch("agent.shopify_store.urlopen")
    def test_raises_on_graphql_errors(self, mock_urlopen):
        response_data = {
            "errors": [{"message": "Access denied"}]
        }
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(response_data).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        with pytest.raises(ShopifyStoreError, match="Access denied"):
            _graphql_request("test.myshopify.com", "token", "{ shop { name } }")

    @patch("agent.shopify_store.urlopen")
    def test_raises_on_http_error(self, mock_urlopen):
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            "url", 401, "Unauthorized", {}, None
        )
        with pytest.raises(ShopifyStoreError, match="HTTP 401"):
            _graphql_request("test.myshopify.com", "bad_token", "{ shop { name } }")

    @patch("agent.shopify_store.urlopen")
    def test_raises_on_network_error(self, mock_urlopen):
        from urllib.error import URLError
        mock_urlopen.side_effect = URLError("Connection refused")
        with pytest.raises(ShopifyStoreError, match="Network error"):
            _graphql_request("test.myshopify.com", "token", "{ shop { name } }")


# ── Secret validation ────────────────────────────────────────────────────────

class TestValidateSecret:
    def test_valid_secret(self):
        secret = {
            "SHOPIFY_STORE_DOMAIN": "test.myshopify.com",
            "SHOPIFY_CLIENT_ID": "client123",
            "SHOPIFY_CLIENT_SECRET": "secret456",
        }
        domain, cid, cs = _validate_secret(secret)
        assert domain == "test.myshopify.com"
        assert cid == "client123"
        assert cs == "secret456"

    def test_strips_protocol(self):
        secret = {
            "SHOPIFY_STORE_DOMAIN": "https://test.myshopify.com/",
            "SHOPIFY_CLIENT_ID": "id",
            "SHOPIFY_CLIENT_SECRET": "secret",
        }
        domain, _, _ = _validate_secret(secret)
        assert domain == "test.myshopify.com"

    def test_raises_on_missing_domain(self):
        with pytest.raises(ShopifyStoreError, match="SHOPIFY_STORE_DOMAIN"):
            _validate_secret({"SHOPIFY_CLIENT_ID": "id", "SHOPIFY_CLIENT_SECRET": "s"})

    def test_raises_on_missing_client_id(self):
        with pytest.raises(ShopifyStoreError, match="SHOPIFY_CLIENT_ID"):
            _validate_secret({"SHOPIFY_STORE_DOMAIN": "d", "SHOPIFY_CLIENT_SECRET": "s"})

    def test_raises_on_missing_client_secret(self):
        with pytest.raises(ShopifyStoreError, match="SHOPIFY_CLIENT_SECRET"):
            _validate_secret({"SHOPIFY_STORE_DOMAIN": "d", "SHOPIFY_CLIENT_ID": "id"})


# ── HTML stripping ───────────────────────────────────────────────────────────

class TestStripHtml:
    def test_strips_tags(self):
        assert _strip_html("<p>Hello <b>world</b></p>") == "Hello world"

    def test_handles_empty(self):
        assert _strip_html("") == ""

    def test_collapses_whitespace(self):
        assert _strip_html("<p>  spaced   out  </p>") == "spaced out"


# ── API version ──────────────────────────────────────────────────────────────

def test_api_version_is_2026_07():
    assert SHOPIFY_API_VERSION == "2026-07"
