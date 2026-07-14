"""ElecKart storefront server: static web/store/ plus the /api/storefront/* JSON routes.

Modeled on src/web.py's request-handling shape, but fully separate — a different port, a
different static root, and its own event log. Does not import or modify src/web.py.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv

import storefront_agent
from tools import PRODUCTS, PRODUCTS_BY_ID, get_reviews


ROOT = Path(__file__).resolve().parents[1]
STORE_WEB_ROOT = ROOT / "web" / "store"
EVENTS_PATH = ROOT / "storefront_events.jsonl"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")
_ALLOWED_EVENT_SOURCES = {"chat", "manual"}
_ALLOWED_EVENT_TYPES = {"cart_add"}


def _product_summary(product: dict[str, Any]) -> dict[str, Any]:
    return {
        key: product[key]
        for key in ("id", "name", "category", "price", "in_stock", "rating", "num_reviews", "features", "specs")
    }


def get_storefront_products() -> list[dict[str, Any]]:
    return [_product_summary(product) for product in PRODUCTS]


def get_storefront_product_detail(product_id: str) -> dict[str, Any]:
    product = PRODUCTS_BY_ID.get(product_id)
    if product is None:
        raise ValueError("Product not found.")
    related = [
        _product_summary(candidate)
        for candidate in PRODUCTS
        if candidate["category"] == product["category"] and candidate["id"] != product_id
    ][:4]
    return {"product": product, "reviews": get_reviews(product_id), "related": related}


def append_event(event: dict[str, Any]) -> None:
    with EVENTS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event) + "\n")


def get_events_summary() -> dict[str, Any]:
    counts: dict[str, int] = {}
    total = 0
    if EVENTS_PATH.exists():
        for line in EVENTS_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            source = event.get("source")
            if isinstance(source, str):
                counts[source] = counts.get(source, 0) + 1
                total += 1
    return {"counts": counts, "total": total}


def _clean_cart(raw_cart: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_cart, list):
        return []
    cleaned = []
    for item in raw_cart:
        if not isinstance(item, dict):
            continue
        product_id = item.get("product_id")
        quantity = item.get("quantity", 1)
        if isinstance(product_id, str) and product_id in PRODUCTS_BY_ID:
            cleaned.append({"product_id": product_id, "quantity": quantity if isinstance(quantity, int) else 1})
    return cleaned


class StorefrontHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(STORE_WEB_ROOT), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[store] {self.address_string()} - {format % args}")

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 65_536:
            raise ValueError("Request body must be JSON and under 64KB.")
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(body, dict):
            raise ValueError("Request JSON must be an object.")
        return body

    def do_GET(self) -> None:  # noqa: N802
        route = urlparse(self.path).path
        try:
            if route == "/api/storefront/products":
                self._send_json({"products": get_storefront_products()})
                return
            if route.startswith("/api/storefront/product/"):
                product_id = route[len("/api/storefront/product/") :]
                if not _SAFE_ID.match(product_id):
                    raise ValueError("Invalid product id.")
                self._send_json(get_storefront_product_detail(product_id))
                return
            if route == "/api/storefront/events/summary":
                self._send_json(get_events_summary())
                return
            if route == "/":
                self.path = "/index.html"
            super().do_GET()
        except ValueError as error:
            self._send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        route = urlparse(self.path).path
        try:
            if route == "/api/storefront/search":
                body = self._read_json_body()
                query = body.get("query")
                if not isinstance(query, str) or not query.strip() or len(query) > 2_000:
                    raise ValueError("query must be non-empty text under 2,000 characters.")
                model = body.get("model") if isinstance(body.get("model"), str) else None
                result = storefront_agent.search(query.strip(), _clean_cart(body.get("cart")), model)
                self._send_json(result)
                return

            if route == "/api/storefront/chat":
                body = self._read_json_body()
                transcript = body.get("transcript")
                if not isinstance(transcript, list) or not transcript:
                    raise ValueError("transcript must be a non-empty list.")
                model = body.get("model") if isinstance(body.get("model"), str) else None
                result = storefront_agent.chat(transcript, _clean_cart(body.get("cart")), model)
                self._send_json(result)
                return

            if route == "/api/storefront/event":
                body = self._read_json_body()
                event_type = body.get("type", "cart_add")
                source = body.get("source")
                product_id = body.get("product_id")
                quantity = body.get("quantity", 1)
                if event_type not in _ALLOWED_EVENT_TYPES:
                    raise ValueError("Unsupported event type.")
                if source not in _ALLOWED_EVENT_SOURCES:
                    raise ValueError("source must be 'chat' or 'manual'.")
                if not isinstance(product_id, str) or product_id not in PRODUCTS_BY_ID:
                    raise ValueError("Unknown product_id.")
                if not isinstance(quantity, int) or quantity < 1:
                    quantity = 1
                event = {
                    "ts": round(time.time(), 3),
                    "type": event_type,
                    "source": source,
                    "product_id": product_id,
                    "quantity": quantity,
                }
                append_event(event)
                self._send_json({"ok": True})
                return

            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
        except ValueError as error:
            self._send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:  # Defensive boundary for local development.
            self._send_json({"error": f"Unexpected server error: {error}"}, HTTPStatus.INTERNAL_SERVER_ERROR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the ElecKart storefront server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    load_dotenv(ROOT / ".env")
    server = ThreadingHTTPServer((args.host, args.port), StorefrontHandler)
    print(f"ElecKart storefront running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
