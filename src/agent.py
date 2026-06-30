"""A deliberately naive OpenRouter tool-use loop for the interview exercise."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from dotenv import load_dotenv

from tools import OPENROUTER_TOOLS, dispatch


load_dotenv()

MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-3.1-flash-lite")
MAX_STEPS = 8
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Intentionally minimal baseline for the interview; candidates are expected to improve this.
SYSTEM_PROMPT = """You are running the starter baseline policy for this interview exercise.
Use a simple one-search strategy: call search_products once, add the first returned product to cart, and briefly tell the shopper what you picked.
This baseline is intentionally minimal so candidates can improve verification and selection behavior."""


class OpenRouterError(RuntimeError):
    """An OpenRouter request failed or returned an unusable payload."""


def _chat_completion(
    messages: list[dict[str, Any]], model: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise OpenRouterError(
            "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add a key."
        )

    payload = {
        "model": model,
        "messages": messages,
        "tools": OPENROUTER_TOOLS,
        "tool_choice": "auto",
        "temperature": 0,
        # Do not silently route to an endpoint that cannot honour tool calling.
        # NOTE: keep require_parameters but do NOT also pin parallel_tool_calls here.
        # On OpenRouter the two together over-constrain routing for some tool-capable
        # models (e.g. openai/gpt-4o-mini), yielding a 404 "no endpoints" error.
        # The loop below already handles multiple tool calls per turn.
        "provider": {"require_parameters": True},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
        "X-OpenRouter-Title": os.getenv("OPENROUTER_APP_NAME", "Shopping Agent Eval"),
    }
    request = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise OpenRouterError(f"OpenRouter returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise OpenRouterError(f"OpenRouter request failed: {error.reason}") from error

    choices = body.get("choices") or []
    if not choices or not choices[0].get("message"):
        raise OpenRouterError(f"OpenRouter returned no assistant message: {body}")

    metadata = {
        "generation_id": body.get("id"),
        "requested_model": model,
        "resolved_model": body.get("model", model),
        "usage": body.get("usage"),
    }
    return choices[0]["message"], metadata


def _parse_tool_input(raw_arguments: str | dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(raw_arguments, dict):
        return raw_arguments
    if not isinstance(raw_arguments, str):
        return {"_invalid": "missing tool arguments"}
    try:
        parsed = json.loads(raw_arguments)
    except json.JSONDecodeError as error:
        return {"_invalid": f"invalid JSON: {error.msg}"}
    return parsed if isinstance(parsed, dict) else {"_invalid": "arguments must be an object"}


def run_agent(
    query: str, model: str | None = None
) -> tuple[str, list[dict[str, Any]], str | None]:
    """Run the agent and return final text, a replayable trace, and cart product id."""
    active_model = model or MODEL
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": query},
    ]
    trajectory: list[dict[str, Any]] = []
    cart_product_id: str | None = None

    for step in range(1, MAX_STEPS + 1):
        started_at = time.perf_counter()
        assistant_message, metadata = _chat_completion(messages, active_model)
        trajectory.append(
            {
                "type": "model_call",
                "step": step,
                "latency_ms": round((time.perf_counter() - started_at) * 1000),
                **metadata,
            }
        )

        tool_calls = assistant_message.get("tool_calls") or []
        # Preserve the assistant tool-call turn exactly before appending tool results.
        messages.append(
            {
                "role": "assistant",
                "content": assistant_message.get("content") or "",
                "tool_calls": tool_calls,
            }
        )
        if not tool_calls:
            return assistant_message.get("content") or "", trajectory, cart_product_id

        for tool_call in tool_calls:
            function = tool_call.get("function") or {}
            name = function.get("name", "")
            tool_input = _parse_tool_input(function.get("arguments"))
            if "_invalid" in tool_input:
                result: Any = {"error": "invalid_tool_input", "message": tool_input["_invalid"]}
            else:
                result = dispatch(name, tool_input)
            trajectory.append(
                {
                    "type": "tool_call",
                    "step": step,
                    "name": name,
                    "input": tool_input,
                    "result": result,
                }
            )
            if name == "add_to_cart" and isinstance(result, dict) and result.get("status") == "added":
                cart_product_id = result["product_id"]
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.get("id"),
                    "content": json.dumps(result),
                }
            )

    return "I could not complete a recommendation within the tool-use limit.", trajectory, cart_product_id
