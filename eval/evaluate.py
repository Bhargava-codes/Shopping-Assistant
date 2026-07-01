"""Outcome-only evaluator for the shopping assistant exercise.

The score considers the final cart product and its hard constraints. The trace
retains trajectory, latency, token, and generation metadata for inspection.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from agent import OpenRouterError, run_agent  # noqa: E402
from tools import PRODUCTS_BY_ID  # noqa: E402


CASES_PATH = ROOT / "data" / "test_cases.json"
RESULTS_ROOT = ROOT / "eval" / "results"
BENCHMARK_MODEL = os.getenv("BENCHMARK_MODEL", "google/gemini-3.1-flash-lite")
DEFAULT_WORKERS = int(os.getenv("EVAL_WORKERS", "6"))


def _short_text(value: str, limit: int = 700) -> str:
    text = " ".join((value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _product_label(product: dict[str, Any] | None, product_id: str | None) -> str:
    if product is None:
        return product_id or "none"
    return f"{product['name']} ({product['id']})"


def _write_summary(run_dir: Path, rows: list[dict[str, Any]], passed: int) -> None:
    lines = [
        "# Benchmark Summary",
        "",
        f"Model: `{BENCHMARK_MODEL}`",
        f"Score: {passed} / {len(rows)}",
        "",
        "Use this file first. It shows the shopper query, the assistant output, the selected product, and why the case failed if it failed.",
        "",
    ]
    for row in rows:
        lines.extend(
            [
                f"## {row['case_id']} - {row['verdict']}",
                "",
                f"**Query:** {row['query']}",
                "",
                f"**Assistant output:** {row['final_text'] or '(no final response)'}",
                "",
                f"**Selected product:** {row['selected_product']}",
                "",
                f"**Why wrong:** {row['why_wrong']}",
                "",
            ]
        )
    (run_dir / "summary.md").write_text("\n".join(lines).rstrip() + "\n")


def failed_constraints(product: dict[str, Any], constraints: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if product["price"] > constraints["max_price"]:
        failures.append(f"over budget: ₹{product['price']} > ₹{constraints['max_price']}")
    if product["category"] != constraints["category"]:
        failures.append(f"wrong category: {product['category']} != {constraints['category']}")
    if product["rating"] < constraints["min_rating"]:
        failures.append(f"rating too low: {product['rating']} < {constraints['min_rating']}")
    if constraints.get("must_be_in_stock") and not product["in_stock"]:
        failures.append("out of stock")
    missing_features = [
        feature for feature in constraints.get("required_features", []) if feature not in product["features"]
    ]
    if missing_features:
        failures.append(f"missing features: {', '.join(missing_features)}")
    return failures


def validate_fixture(cases: list[dict[str, Any]]) -> None:
    """Protect the interview from impossible cases without changing score semantics."""
    unsolvable = [
        case["id"]
        for case in cases
        if not any(not failed_constraints(product, case["constraints"]) for product in PRODUCTS_BY_ID.values())
    ]
    if unsolvable:
        raise ValueError(f"Fixture contains unsolvable cases: {', '.join(unsolvable)}")


def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    try:
        final_text, trajectory, product_id = run_agent(case["query"], model=BENCHMARK_MODEL)
    except OpenRouterError as error:
        return {
            "case": case,
            "trace": {
                "case_id": case["id"],
                "query": case["query"],
                "constraints": case["constraints"],
                "error": str(error),
                "trajectory": [],
            },
            "verdict": "ERROR",
            "reason": str(error),
            "passed": False,
            "product": None,
            "product_id": None,
            "final_text": "",
        }

    product = PRODUCTS_BY_ID.get(product_id) if product_id else None
    if product is None:
        failures = ["incomplete: agent did not add a valid product to the cart"]
    else:
        failures = failed_constraints(product, case["constraints"])

    passed = not failures
    reason = "all hard constraints met" if passed else "; ".join(failures)
    trace = {
        "case_id": case["id"],
        "query": case["query"],
        "constraints": case["constraints"],
        "final_text": final_text,
        "trajectory": trajectory,
        "recommended_product_id": product_id,
        "recommended_product": product,
        "failed_constraints": failures,
    }
    return {
        "case": case,
        "trace": trace,
        "verdict": "PASS" if passed else "FAIL",
        "reason": reason,
        "passed": passed,
        "product": product,
        "product_id": product_id,
        "final_text": final_text,
    }


def evaluate(cases: list[dict[str, Any]], workers: int = DEFAULT_WORKERS) -> int:
    run_dir = RESULTS_ROOT / datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_dir.mkdir(parents=True, exist_ok=True)
    passed = 0
    summary_rows: list[dict[str, Any]] = []
    workers = max(1, min(workers, len(cases) or 1))

    if workers == 1:
        results = [evaluate_case(case) for case in cases]
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            results = list(executor.map(evaluate_case, cases))

    for result in results:
        case = result["case"]
        product = result["product"]
        product_id = result["product_id"]
        final_text = result["final_text"]
        passed_case = result["passed"]
        verdict = result["verdict"]
        reason = result["reason"]
        passed += int(passed_case)
        print(f"{case['id']}  {verdict} — {reason}")
        if not passed_case:
            print(f"  Query: {case['query']}")
            print(f"  Output: {_short_text(final_text, 320) or '(no final response)'}")
            print(f"  Selected: {_product_label(product, product_id)}")
        (run_dir / f"{case['id']}.json").write_text(json.dumps(result["trace"], indent=2) + "\n")
        summary_rows.append(
            {
                "case_id": case["id"],
                "verdict": verdict,
                "query": case["query"],
                "final_text": _short_text(final_text),
                "selected_product": _product_label(product, product_id),
                "why_wrong": "Not wrong: passed." if passed_case else reason,
            }
        )

    score = round((passed / len(cases)) * 100) if cases else 0
    _write_summary(run_dir, summary_rows, passed)
    print(f"\nBENCHMARK MODEL {BENCHMARK_MODEL}")
    print(f"EVAL WORKERS {workers}")
    print(f"PASSED {passed} / {len(cases)}  ({score}%)")
    print(f"Traces written to {run_dir.relative_to(ROOT)}")
    print(f"Start with {run_dir.relative_to(ROOT) / 'summary.md'}")
    return passed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, help="Run only the first N cases.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Number of cases to run in parallel.")
    parser.add_argument(
        "--validate-fixture",
        action="store_true",
        help="Validate that every case has a valid catalogue product, without model calls.",
    )
    args = parser.parse_args()
    cases: list[dict[str, Any]] = json.loads(CASES_PATH.read_text())
    validate_fixture(cases)
    if args.validate_fixture:
        print(f"Fixture valid: {len(cases)} cases; every case has at least one valid product.")
        return
    evaluate(cases[: args.limit] if args.limit else cases, workers=args.workers)


if __name__ == "__main__":
    main()
