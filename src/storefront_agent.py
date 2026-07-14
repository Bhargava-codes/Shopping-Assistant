"""ElecKart storefront assistant: one-shot search() and multi-turn chat() over OpenRouter.

Both share one tool-loop and the search_catalogue tool (wraps tools.search_products). Neither
function ever mutates the cart itself — chat() only ever *proposes* an add via "propose_add";
the storefront web layer/UI is what actually records a cart-add once the shopper confirms.
"""

from __future__ import annotations

import json
import os
import re
import ssl
import urllib.error
import urllib.request
from typing import Any

import certifi
from dotenv import load_dotenv

from tools import PRODUCTS_BY_ID, search_products


load_dotenv()

DEFAULT_MODEL = os.getenv("OPENROUTER_STOREFRONT_MODEL", "google/gemini-3.1-flash-lite")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_STEPS = 4
MAX_TOKENS = 800
MAX_PRODUCT_IDS = 4

# Without an explicit CA bundle, urllib on some macOS python.org builds fails with
# CERTIFICATE_VERIFY_FAILED because it has no system CA store linked in.
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

CATALOGUE_NOTE = "Catalogue prices are in Indian Rupees (₹). Categories: mouse, keyboard, headphones, webcam, monitor."

SEARCH_SYSTEM_PROMPT = f"""You are the ElecKart storefront search assistant. Help the shopper find matching electronics from the local catalogue. {CATALOGUE_NOTE}

Call the search_catalogue tool to find candidates before answering; you may call it more than once with different queries.

When done, reply with ONLY a single strict JSON object (no markdown fences, no extra text) in exactly this shape:
{{"reply": "<1-3 sentence reply to the shopper>", "product_ids": ["<id>", ...], "propose_add": []}}

Rules:
- "product_ids" must only contain ids actually returned by search_catalogue, most relevant first, at most {MAX_PRODUCT_IDS}.
- This is browse/search only: "propose_add" MUST always be an empty list.
- Never invent a product id, price, or feature. If nothing matches, say so in "reply" and return an empty "product_ids"."""

CHAT_SYSTEM_PROMPT = f"""You are Cart, the ElecKart storefront's shopping assistant. You can search the catalogue and PROPOSE adding a product to the shopper's cart, but you never add anything yourself — an add only happens when the shopper taps Confirm on a chip you propose. {CATALOGUE_NOTE}

Call the search_catalogue tool to find candidates before recommending or proposing anything; you may call it multiple times.

You are told the shopper's CURRENT cart contents (product ids + quantities) before every request — use it to avoid re-proposing something already in the cart and to answer questions like "what's in my cart".

Earlier turns are given to you as your OWN prior raw JSON replies (not paraphrases) plus the shopper's messages. Use "product_ids" from your own earlier turns to resolve references like "the second one" or "the office one" to the EXACT product id you showed — never guess by position if it's ambiguous; ask instead.

When done, reply with ONLY a single strict JSON object (no markdown fences, no extra text) in exactly this shape:
{{"reply": "<1-4 sentence reply to the shopper>", "product_ids": ["<id>", ...], "propose_add": [{{"product_id": "<id>", "quantity": <integer >= 1>}}]}}

Rules:
- "product_ids" must only contain ids that came from search_catalogue results (this turn or an earlier turn), at most {MAX_PRODUCT_IDS}, most relevant first.
- "propose_add" is optional and usually empty. Only populate it when the shopper has asked for or clearly confirmed a SPECIFIC product right now. Every "propose_add" product_id MUST also appear in "product_ids". Default quantity is 1 unless stated otherwise.
- Your "reply" text must describe the SAME product(s) named in "propose_add" — never mention adding one product while proposing a different one.
- Do not propose adding a product already in the shopper's cart at the same or greater quantity — mention it's already there instead.
- Never invent a product id, price, or feature. If unsure which product the shopper means, ask a clarifying question and leave "propose_add" empty."""

STOREFRONT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_catalogue",
            "description": "Search the ElecKart product catalogue (mouse, keyboard, headphones, webcam, monitor).",
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
    }
]


class EngineError(RuntimeError):
    """The OpenRouter call, tool loop, or model output could not be used."""


def _openrouter_headers() -> dict[str, str]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise EngineError("OPENROUTER_API_KEY is not set.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
        "X-OpenRouter-Title": os.getenv("OPENROUTER_APP_NAME", "ElecKart Storefront"),
    }


def _chat_completion(messages: list[dict[str, Any]], model: str) -> dict[str, Any]:
    payload = {
        "model": model,
        "messages": messages,
        "tools": STOREFRONT_TOOLS,
        "tool_choice": "auto",
        "temperature": 0,
        "max_tokens": MAX_TOKENS,
        "provider": {"require_parameters": True},
    }
    request = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=_openrouter_headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60, context=_SSL_CONTEXT) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise EngineError(f"OpenRouter returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise EngineError(f"OpenRouter request failed: {error.reason}") from error

    choices = body.get("choices") or []
    if not choices or not choices[0].get("message"):
        raise EngineError(f"OpenRouter returned no assistant message: {body}")
    return choices[0]["message"]


def _parse_tool_arguments(raw_arguments: str | dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(raw_arguments, dict):
        return raw_arguments
    if not isinstance(raw_arguments, str):
        return {}
    try:
        parsed = json.loads(raw_arguments)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _dispatch_tool(name: str, tool_input: dict[str, Any]) -> Any:
    if name != "search_catalogue":
        return {"error": "unknown_tool", "name": name}
    query = tool_input.get("query")
    max_results = tool_input.get("max_results", 8)
    if not isinstance(query, str) or not query.strip():
        return {"error": "invalid_tool_input", "message": "query is required"}
    if not isinstance(max_results, int):
        max_results = 8
    return search_products(query, max_results)


def _run_tool_loop(messages: list[dict[str, Any]], model: str) -> str:
    working = list(messages)
    for _ in range(MAX_STEPS):
        assistant_message = _chat_completion(working, model)
        tool_calls = assistant_message.get("tool_calls") or []
        working.append(
            {
                "role": "assistant",
                "content": assistant_message.get("content") or "",
                "tool_calls": tool_calls,
            }
        )
        if not tool_calls:
            return assistant_message.get("content") or ""
        for tool_call in tool_calls:
            function = tool_call.get("function") or {}
            name = function.get("name", "")
            tool_input = _parse_tool_arguments(function.get("arguments"))
            result = _dispatch_tool(name, tool_input)
            working.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.get("id"),
                    "content": json.dumps(result),
                }
            )
    raise EngineError("Tool loop did not converge within the step limit.")


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("model response was not a JSON object")
    return parsed


def _normalise_turn(parsed: dict[str, Any], allow_propose_add: bool) -> dict[str, Any]:
    reply = parsed.get("reply")
    if not isinstance(reply, str):
        reply = ""

    raw_product_ids = parsed.get("product_ids")
    product_ids = [
        pid for pid in (raw_product_ids if isinstance(raw_product_ids, list) else []) if isinstance(pid, str) and pid in PRODUCTS_BY_ID
    ][:MAX_PRODUCT_IDS]

    normalised_propose: list[dict[str, Any]] = []
    raw_propose = parsed.get("propose_add")
    if allow_propose_add and isinstance(raw_propose, list):
        for item in raw_propose:
            if not isinstance(item, dict):
                continue
            product_id = item.get("product_id")
            # A proposed add must also be one of the ids the reply names, so the confirm
            # chip (built from propose_add) can never point at a product the reply didn't.
            if not isinstance(product_id, str) or product_id not in product_ids:
                continue
            quantity = item.get("quantity", 1)
            if not isinstance(quantity, int) or quantity < 1:
                quantity = 1
            normalised_propose.append({"product_id": product_id, "quantity": quantity})

    return {"reply": reply, "product_ids": product_ids, "propose_add": normalised_propose}


def _format_cart_context(cart: list[dict[str, Any]]) -> str:
    lines = []
    for item in cart or []:
        if not isinstance(item, dict):
            continue
        product_id = item.get("product_id")
        quantity = item.get("quantity", 1)
        if isinstance(product_id, str) and product_id in PRODUCTS_BY_ID:
            lines.append(f"- {product_id} x{quantity if isinstance(quantity, int) else 1}")
    if not lines:
        return "The shopper's cart is currently empty."
    return "The shopper's current cart (product_id x quantity):\n" + "\n".join(lines)


def _validate_transcript(transcript: Any) -> list[dict[str, str]]:
    if not isinstance(transcript, list):
        raise ValueError("transcript must be a list")
    cleaned: list[dict[str, str]] = []
    for turn in transcript[-20:]:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role")
        content = turn.get("content")
        if role not in ("user", "assistant") or not isinstance(content, str):
            continue
        cleaned.append({"role": role, "content": content[:4000]})
    if not cleaned or cleaned[-1]["role"] != "user":
        raise ValueError("transcript must end with a user message")
    return cleaned


def _last_user_message(transcript: Any) -> str:
    if isinstance(transcript, list):
        for turn in reversed(transcript):
            if isinstance(turn, dict) and turn.get("role") == "user" and isinstance(turn.get("content"), str):
                return turn["content"]
    return ""


def _fallback_result(query: str) -> dict[str, Any]:
    results = search_products(query, MAX_PRODUCT_IDS) if query.strip() else []
    if not results:
        reply = "I couldn't find anything matching that in the catalogue right now."
    else:
        names = ", ".join(product["name"] for product in results[:3])
        reply = f"Here's what I found in the catalogue: {names}."
    return {
        "reply": reply,
        "product_ids": [product["id"] for product in results],
        "propose_add": [],
        "engine": "fallback",
    }


def search(query: str, cart: list[dict[str, Any]] | None = None, model: str | None = None) -> dict[str, Any]:
    """One-shot ranked search for the plain browse/search box. Never proposes an add."""
    active_model = model or DEFAULT_MODEL
    try:
        if not isinstance(query, str) or not query.strip():
            raise ValueError("query must be non-empty text")
        messages = [
            {"role": "system", "content": SEARCH_SYSTEM_PROMPT},
            {"role": "user", "content": f"{_format_cart_context(cart or [])}\n\nShopper request: {query}"},
        ]
        raw_content = _run_tool_loop(messages, active_model)
        parsed = _extract_json_object(raw_content)
        turn = _normalise_turn(parsed, allow_propose_add=False)
        turn["engine"] = "llm"
        return turn
    except (EngineError, ValueError):
        return _fallback_result(query if isinstance(query, str) else "")


def chat(transcript: list[dict[str, Any]], cart: list[dict[str, Any]] | None = None, model: str | None = None) -> dict[str, Any]:
    """Multi-turn assistant. `transcript` is the full client-owned history (the server is
    stateless): [{"role": "user"|"assistant", "content": str}, ...] ending with a user turn.
    Assistant turns must be the raw JSON string returned by a prior chat()/search() call, not
    a paraphrase, so the model can resolve references like "the second one" against its own
    prior structured output instead of re-deriving it from prose."""
    active_model = model or DEFAULT_MODEL
    try:
        cleaned_transcript = _validate_transcript(transcript)
        messages = [{"role": "system", "content": f"{CHAT_SYSTEM_PROMPT}\n\n{_format_cart_context(cart or [])}"}]
        messages.extend(cleaned_transcript)
        raw_content = _run_tool_loop(messages, active_model)
        parsed = _extract_json_object(raw_content)
        turn = _normalise_turn(parsed, allow_propose_add=True)
        turn["engine"] = "llm"
        return turn
    except (EngineError, ValueError):
        return _fallback_result(_last_user_message(transcript))
