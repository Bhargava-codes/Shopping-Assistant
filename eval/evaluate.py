"""Outcome-only evaluator for the shopping assistant exercise.

Failure-mode coverage in the seeded fixture:
- hard budget: tc_001, tc_004, tc_007, tc_013
- single-search / first-result selection: tc_002, tc_005, tc_010, tc_014
- unverified specifications: tc_003, tc_006, tc_011, tc_016
- review evidence ignored: tc_001, tc_004, tc_007, tc_010, tc_013, tc_017
- stock ignored: tc_001, tc_004, tc_007, tc_010, tc_013

The score deliberately considers only the final cart product and its hard
constraints. The trace retains trajectory, latency, token, and generation
metadata but none of those fields affect the score.
"""

from __future__ import annotations

import argparse
import json
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


def evaluate(cases: list[dict[str, Any]]) -> int:
    run_dir = RESULTS_ROOT / datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_dir.mkdir(parents=True, exist_ok=True)
    passed = 0

    for case in cases:
        try:
            final_text, trajectory, product_id = run_agent(case["query"])
        except OpenRouterError as error:
            trace = {
                "case_id": case["id"],
                "query": case["query"],
                "constraints": case["constraints"],
                "error": str(error),
                "trajectory": [],
            }
            (run_dir / f"{case['id']}.json").write_text(json.dumps(trace, indent=2) + "\n")
            print(f"{case['id']}  ERROR — {error}")
            continue

        product = PRODUCTS_BY_ID.get(product_id) if product_id else None
        if product is None:
            failures = ["incomplete: agent did not add a valid product to the cart"]
        else:
            failures = failed_constraints(product, case["constraints"])

        passed_case = not failures
        passed += int(passed_case)
        verdict = "PASS" if passed_case else "FAIL"
        reason = "all hard constraints met" if passed_case else "; ".join(failures)
        print(f"{case['id']}  {verdict} — {reason}")
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
        (run_dir / f"{case['id']}.json").write_text(json.dumps(trace, indent=2) + "\n")

    score = round((passed / len(cases)) * 100) if cases else 0
    print(f"\nPASSED {passed} / {len(cases)}  ({score}%)")
    print(f"Traces written to {run_dir.relative_to(ROOT)}")
    return passed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, help="Run only the first N cases.")
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
    evaluate(cases[: args.limit] if args.limit else cases)


if __name__ == "__main__":
    main()
