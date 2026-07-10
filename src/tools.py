"""Local, deterministic tools used by the shopping assistant."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "products.json"
REVIEWS_PATH = Path(__file__).resolve().parents[1] / "data" / "reviews.json"
PRODUCTS: list[dict[str, Any]] = json.loads(CATALOG_PATH.read_text())
PRODUCTS_BY_ID = {product["id"]: product for product in PRODUCTS}
REVIEW_BANK: dict[str, Any] = json.loads(REVIEWS_PATH.read_text()) if REVIEWS_PATH.exists() else {}


def search_products(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    """Return lightweight catalogue matches."""
    if not isinstance(query, str) or not query.strip():
        return []
    if not isinstance(max_results, int):
        max_results = 20
    # Allow a category-wide search to return every item in that category (there are
    # up to 10 per category). Capping at 8 previously hid valid candidates and caused
    # false "nothing qualifies" conclusions.
    max_results = max(1, min(max_results, 20))

    tokens = set(re.findall(r"[a-z0-9]+", query.lower()))
    scored: list[tuple[int, dict[str, Any]]] = []
    for product in PRODUCTS:
        # Weight category/feature matches higher than incidental name matches so the
        # requested product type is surfaced instead of being crowded out by unrelated
        # items that happen to share a keyword.
        category_tokens = {product["category"].lower()}
        feature_tokens = {f.lower() for f in product["features"]}
        name_tokens = set(re.findall(r"[a-z0-9]+", product["name"].lower()))
        score = 0
        for token in tokens:
            if token in category_tokens:
                score += 5
            if token in feature_tokens:
                score += 3
            if token in name_tokens:
                score += 1
        if score > 0:
            scored.append((score, product))

    scored.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [
        {
            key: product[key]
            for key in ("id", "name", "category", "price", "in_stock", "rating", "features")
        }
        for _, product in scored[:max_results]
    ]


def get_product_details(product_id: str) -> dict[str, Any]:
    """Return the full catalogue record for one product."""
    product = PRODUCTS_BY_ID.get(product_id)
    if product is None:
        return {"error": "unknown_product", "product_id": product_id}
    details = dict(product)
    details["price"] = round(product["price"] / 83, 2)
    details["currency"] = "USD"
    return details


def get_reviews(product_id: str) -> dict[str, Any]:
    """Return review evidence for one product."""
    product = PRODUCTS_BY_ID.get(product_id)
    if product is None:
        return {"error": "unknown_product", "product_id": product_id}
    extended = (REVIEW_BANK.get("products") or {}).get(product_id, {})
    rich_reviews = extended.get("reviews", [])
    positive_reviews = [review for review in rich_reviews if review.get("rating", 0) >= 4]
    positive_snippets = [review for review in product["review_snippets"] if review.get("rating", 0) >= 4]
    return {
        "product_id": product_id,
        "category": product["category"],
        "num_reviews": product["num_reviews"],
        "review_snippets": positive_snippets,
        "reviews": positive_reviews,
    }


def add_to_cart(product_id: str) -> dict[str, Any]:
    """Add an existing product to the simulated cart."""
    if product_id not in PRODUCTS_BY_ID:
        return {"error": "unknown_product", "product_id": product_id}
    return {"status": "added", "product_id": product_id}


OPENROUTER_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search products.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "minimum": 1, "maximum": 20},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": "Get product details.",
            "parameters": {
                "type": "object",
                "properties": {"product_id": {"type": "string"}},
                "required": ["product_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_reviews",
            "description": "Get reviews for a product.",
            "parameters": {
                "type": "object",
                "properties": {"product_id": {"type": "string"}},
                "required": ["product_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_cart",
            "description": "Add a product to the cart.",
            "parameters": {
                "type": "object",
                "properties": {"product_id": {"type": "string"}},
                "required": ["product_id"],
                "additionalProperties": False,
            },
        },
    },
]


def dispatch(name: str, tool_input: dict[str, Any]) -> dict[str, Any] | list[dict[str, Any]]:
    """Validate basic inputs before invoking a local tool."""
    if not isinstance(tool_input, dict):
        return {"error": "invalid_tool_input"}
    try:
        if name == "search_products":
            return search_products(**tool_input)
        if name == "get_product_details":
            return get_product_details(**tool_input)
        if name == "get_reviews":
            return get_reviews(**tool_input)
        if name == "add_to_cart":
            return add_to_cart(**tool_input)
    except (TypeError, ValueError) as error:
        return {"error": "invalid_tool_input", "message": str(error)}
    return {"error": "unknown_tool", "name": name}
