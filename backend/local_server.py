"""
local_server.py — Minimal local HTTP server for development.

Wraps the Lambda handler so the browser can reach it on http://localhost:8000.
Uses only Python stdlib — no Flask, no FastAPI, no new dependencies.

The Lambda handler remains the single source of truth for all logic.
This file only translates HTTP ↔ Lambda event format.

Usage:
    cd backend
    source .venv/bin/activate
    USE_MOCK_BEDROCK=true python local_server.py
"""
from __future__ import annotations

import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

# Ensure backend root is on sys.path so sibling modules resolve
_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app import handler as lambda_handler  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("local_server")

PORT = int(os.environ.get("PORT", 8000))


class LambdaProxyHandler(BaseHTTPRequestHandler):
    """Translate HTTP requests into Lambda proxy events and back."""

    # ── Route: OPTIONS /generate-listing ────────────────────────────────────

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self.path != "/generate-listing":
            self._send(404, {"error": "Not found"})
            return
        result = lambda_handler(_make_event("OPTIONS", ""), None)
        self._write_lambda_result(result)

    # ── Route: POST /generate-listing ────────────────────────────────────────

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/generate-listing":
            self._send(404, {"error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length).decode("utf-8") if length else ""

        result = lambda_handler(_make_event("POST", raw_body), None)
        self._write_lambda_result(result)

    # ── Unsupported methods ───────────────────────────────────────────────────

    def do_GET(self) -> None:  # noqa: N802
        result = lambda_handler(_make_event("GET", ""), None)
        self._write_lambda_result(result)

    def do_PUT(self) -> None:  # noqa: N802
        result = lambda_handler(_make_event("PUT", ""), None)
        self._write_lambda_result(result)

    def do_DELETE(self) -> None:  # noqa: N802
        result = lambda_handler(_make_event("DELETE", ""), None)
        self._write_lambda_result(result)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _write_lambda_result(self, result: dict) -> None:
        status = result.get("statusCode", 500)
        headers = result.get("headers", {})
        body = result.get("body", "")

        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        body_bytes = body.encode("utf-8") if isinstance(body, str) else body
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        if body_bytes:
            self.wfile.write(body_bytes)

    def _send(self, status: int, body: dict) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt: str, *args: object) -> None:  # noqa: ANN001
        """Route access log through our logger instead of stderr."""
        logger.info("%s %s", self.address_string(), fmt % args)


def _make_event(method: str, body: str) -> dict:
    """Build a minimal API Gateway v2 proxy event."""
    return {
        "requestContext": {"http": {"method": method.upper()}},
        "headers": {"content-type": "application/json"},
        "body": body,
    }


def main() -> None:
    mock_mode = os.environ.get("USE_MOCK_BEDROCK", "").strip().lower()
    mode_label = "MOCK" if mock_mode == "true" else "BEDROCK" if mock_mode == "false" else "AUTO-MOCK"

    logger.info("─" * 52)
    logger.info("  RojAI local server")
    logger.info("  http://localhost:%d/generate-listing", PORT)
    logger.info("  Mode: %s  (USE_MOCK_BEDROCK=%s)", mode_label, mock_mode or "(unset)")
    logger.info("─" * 52)

    server = HTTPServer(("localhost", PORT), LambdaProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
