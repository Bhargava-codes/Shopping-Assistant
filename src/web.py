"""Local web console for running and inspecting the shopping assistant."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv

from agent import MODEL, OpenRouterError, run_agent
from tools import PRODUCTS, PRODUCTS_BY_ID


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
CASES_PATH = ROOT / "data" / "test_cases.json"
REVIEWS_PATH = ROOT / "data" / "reviews.json"
RESULTS_ROOT = ROOT / "eval" / "results"
CATALOG_URL = "https://openrouter.ai/api/v1/models"
CATALOG_TTL_SECONDS = 600
BENCHMARK_MODEL = os.getenv("BENCHMARK_MODEL", "google/gemini-3.1-flash-lite")
_catalog_cache: dict[str, Any] = {"expires_at": 0.0, "models": []}


def load_review_bank() -> dict[str, Any]:
    if not REVIEWS_PATH.exists():
        return {"category_review_attributes": {}, "products": {}}
    return json.loads(REVIEWS_PATH.read_text())


def _openrouter_headers() -> dict[str, str]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not set. Add it to .env before starting the UI.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:8000"),
        "X-OpenRouter-Title": os.getenv("OPENROUTER_APP_NAME", "Shopping Agent Lab"),
    }


def _normalise_model(model: dict[str, Any]) -> dict[str, Any]:
    architecture = model.get("architecture") or {}
    supported_parameters = model.get("supported_parameters") or []
    model_id = model.get("id", "")
    return {
        "id": model_id,
        "name": model.get("name") or model_id,
        "provider": model_id.split("/", 1)[0] if "/" in model_id else "other",
        "description": model.get("description") or "",
        "contextLength": model.get("context_length") or 0,
        "inputModalities": architecture.get("input_modalities") or [],
        "outputModalities": architecture.get("output_modalities") or [],
        "supportedParameters": supported_parameters,
        "supportsTools": "tools" in supported_parameters,
        "pricing": model.get("pricing") or {},
    }


def get_live_models() -> list[dict[str, Any]]:
    """Fetch the live catalog server-side and cache a browser-safe model shape."""
    now = time.time()
    if _catalog_cache["models"] and now < _catalog_cache["expires_at"]:
        return _catalog_cache["models"]

    request = urllib.request.Request(CATALOG_URL, headers=_openrouter_headers())
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise OpenRouterError(f"OpenRouter model catalog returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise OpenRouterError(f"OpenRouter model catalog request failed: {error.reason}") from error

    models = sorted(
        (_normalise_model(model) for model in payload.get("data", [])),
        key=lambda item: (item["provider"], item["name"].lower()),
    )
    _catalog_cache.update({"models": models, "expires_at": now + CATALOG_TTL_SECONDS})
    return models


def serialise_run(query: str, model: str) -> dict[str, Any]:
    final_text, trajectory, cart_product_id = run_agent(query, model=model)
    model_calls = [event for event in trajectory if event["type"] == "model_call"]
    tool_calls = [event for event in trajectory if event["type"] == "tool_call"]
    cost = sum((event.get("usage") or {}).get("cost") or 0 for event in model_calls)
    return {
        "query": query,
        "finalText": final_text,
        "cartProductId": cart_product_id,
        "trajectory": trajectory,
        "metrics": {
            "modelCalls": len(model_calls),
            "toolCalls": len(tool_calls),
            "latencyMs": sum(event.get("latency_ms") or 0 for event in model_calls),
            "cost": cost,
            "resolvedModel": model_calls[-1].get("resolved_model", model) if model_calls else model,
        },
    }


def diagnose_constraints(
    product: dict[str, Any] | None, constraints: dict[str, Any]
) -> list[dict[str, Any]]:
    """Break a case down into one human-readable pass/fail row per hard constraint.

    This mirrors the scoring in eval/evaluate.py (category, price, rating, stock,
    required features) so the UI explains *exactly* why a case passed or failed.
    """
    if product is None:
        return []
    checks: list[dict[str, Any]] = [
        {
            "label": "Category",
            "expected": constraints["category"],
            "actual": product["category"],
            "ok": product["category"] == constraints["category"],
        },
        {
            "label": "Budget",
            "expected": f"≤ ₹{constraints['max_price']}",
            "actual": f"₹{product['price']}",
            "ok": product["price"] <= constraints["max_price"],
        },
        {
            "label": "Rating",
            "expected": f"≥ {constraints['min_rating']}",
            "actual": str(product["rating"]),
            "ok": product["rating"] >= constraints["min_rating"],
        },
    ]
    if constraints.get("must_be_in_stock"):
        checks.append(
            {
                "label": "Stock",
                "expected": "in stock",
                "actual": "in stock" if product["in_stock"] else "out of stock",
                "ok": bool(product["in_stock"]),
            }
        )
    required = constraints.get("required_features", [])
    if required:
        missing = [feature for feature in required if feature not in product["features"]]
        checks.append(
            {
                "label": "Required features",
                "expected": ", ".join(required),
                "actual": ", ".join(product["features"]) or "none",
                "ok": not missing,
            }
        )
    return checks


def get_trace(directory: str, case_id: str) -> dict[str, Any]:
    """Load one persisted benchmark trace and attach a per-constraint diagnosis."""
    safe = re.compile(r"^[A-Za-z0-9_-]+$")
    if not safe.match(directory) or not safe.match(case_id):
        raise ValueError("Invalid trace identifier.")
    trace_path = (RESULTS_ROOT / directory / f"{case_id}.json").resolve()
    if RESULTS_ROOT.resolve() not in trace_path.parents or not trace_path.is_file():
        raise ValueError("Trace not found.")

    trace = json.loads(trace_path.read_text())
    constraints = trace.get("constraints", {})
    product = trace.get("recommended_product")
    failures = trace.get("failed_constraints") or []
    error = trace.get("error")
    return {
        "caseId": trace.get("case_id", case_id),
        "directory": directory,
        "query": trace.get("query", ""),
        "constraints": constraints,
        "finalText": trace.get("final_text", ""),
        "recommendedProductId": trace.get("recommended_product_id"),
        "recommendedProduct": product,
        "diagnosis": diagnose_constraints(product, constraints),
        "failedConstraints": failures,
        "error": error,
        "passed": bool(trace.get("recommended_product_id")) and not failures and not error,
        "trajectory": trace.get("trajectory", []),
    }


def get_benchmark_runs() -> list[dict[str, Any]]:
    """Summarise persisted CLI evaluation traces without rerunning a paid benchmark."""
    expected_case_count = len(json.loads(CASES_PATH.read_text()))
    if not RESULTS_ROOT.exists():
        return []

    runs: list[dict[str, Any]] = []
    for directory in sorted(RESULTS_ROOT.iterdir(), reverse=True):
        if not directory.is_dir():
            continue
        cases: list[dict[str, Any]] = []
        requested_models: set[str] = set()
        for trace_path in sorted(directory.glob("tc_*.json")):
            try:
                trace = json.loads(trace_path.read_text())
            except json.JSONDecodeError:
                continue
            for event in trace.get("trajectory", []):
                if event.get("type") == "model_call" and event.get("requested_model"):
                    requested_models.add(event["requested_model"])
            failures = trace.get("failed_constraints") or []
            error = trace.get("error")
            passed = bool(trace.get("recommended_product_id")) and not failures and not error
            issue = error or ("; ".join(failures) if failures else "passed")
            cases.append({"id": trace.get("case_id", trace_path.stem), "passed": passed, "issue": issue})

        if not cases:
            continue
        passed_count = sum(case["passed"] for case in cases)
        runs.append(
            {
                "directory": directory.name,
                "casesRun": len(cases),
                "expectedCases": expected_case_count,
                "complete": len(cases) == expected_case_count,
                "passed": passed_count,
                "scorePercent": round((passed_count / len(cases)) * 100),
                "models": sorted(requested_models),
                "cases": cases,
            }
        )
    return runs


def get_products_for_review_browser() -> list[dict[str, Any]]:
    """Return catalogue rows plus review availability for the review browser."""
    review_bank = load_review_bank()
    review_products = review_bank.get("products") or {}
    rows: list[dict[str, Any]] = []
    for product in PRODUCTS:
        rich_reviews = (review_products.get(product["id"]) or {}).get("reviews") or []
        rows.append(
            {
                "id": product["id"],
                "name": product["name"],
                "category": product["category"],
                "price": product["price"],
                "in_stock": product["in_stock"],
                "rating": product["rating"],
                "num_reviews": product["num_reviews"],
                "features": product["features"],
                "rich_review_count": len(rich_reviews),
                "snippet_count": len(product.get("review_snippets") or []),
            }
        )
    return rows


def get_product_review_detail(product_id: str) -> dict[str, Any]:
    safe = re.compile(r"^[A-Za-z0-9_-]+$")
    if not safe.match(product_id):
        raise ValueError("Invalid product id.")
    product = PRODUCTS_BY_ID.get(product_id)
    if product is None:
        raise ValueError("Product not found.")

    review_bank = load_review_bank()
    rich_reviews = ((review_bank.get("products") or {}).get(product_id) or {}).get("reviews") or []
    return {
        "product": product,
        "category_review_attributes": (review_bank.get("category_review_attributes") or {}).get(
            product["category"], []
        ),
        "reviews": rich_reviews,
        "fallback_snippets": product.get("review_snippets") or [],
    }


class AppHandler(SimpleHTTPRequestHandler):
    """Serve the local UI and same-origin JSON endpoints without exposing secrets."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[web] {self.address_string()} - {format % args}")

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
        parsed = urlparse(self.path)
        route = parsed.path
        try:
            if route == "/api/trace":
                params = parse_qs(parsed.query)
                directory = (params.get("dir") or [""])[0]
                case_id = (params.get("case") or [""])[0]
                self._send_json(get_trace(directory, case_id))
                return
            if route == "/api/health":
                self._send_json({"ok": True, "defaultModel": MODEL, "benchmarkModel": BENCHMARK_MODEL})
                return
            if route == "/api/models":
                self._send_json({"models": get_live_models(), "defaultModel": "google/gemini-3.1-flash-lite"})
                return
            if route == "/api/cases":
                self._send_json({"cases": json.loads(CASES_PATH.read_text())})
                return
            if route == "/api/products":
                review_bank = load_review_bank()
                self._send_json(
                    {
                        "products": get_products_for_review_browser(),
                        "categoryReviewAttributes": review_bank.get("category_review_attributes") or {},
                    }
                )
                return
            if route == "/api/product-reviews":
                params = parse_qs(parsed.query)
                product_id = (params.get("product_id") or [""])[0]
                self._send_json(get_product_review_detail(product_id))
                return
            if route == "/api/benchmarks":
                self._send_json({"runs": get_benchmark_runs(), "benchmarkModel": BENCHMARK_MODEL})
                return
            if route == "/reviews":
                self.path = "/reviews.html"
                super().do_GET()
                return
            if route in {"/", "/index.html"}:
                self.path = "/index.html"
            super().do_GET()
        except ValueError as error:
            self._send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)
        except (OpenRouterError, OSError, json.JSONDecodeError) as error:
            self._send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)

    def do_POST(self) -> None:  # noqa: N802
        route = urlparse(self.path).path
        if route != "/api/run":
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            body = self._read_json_body()
            query = body.get("query")
            model = body.get("model")
            if not isinstance(query, str) or not query.strip() or len(query) > 8_000:
                raise ValueError("Query must be non-empty text under 8,000 characters.")
            if not isinstance(model, str) or not model.strip() or len(model) > 200:
                raise ValueError("Model must be a valid OpenRouter model id.")
            self._send_json(serialise_run(query.strip(), model.strip()))
        except ValueError as error:
            self._send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except OpenRouterError as error:
            self._send_json({"error": str(error)}, HTTPStatus.BAD_GATEWAY)
        except Exception as error:  # Defensive boundary for local development UI.
            self._send_json({"error": f"Unexpected server error: {error}"}, HTTPStatus.INTERNAL_SERVER_ERROR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local Shopping Agent Lab UI.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    load_dotenv(ROOT / ".env")
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"Shopping Agent Lab running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
