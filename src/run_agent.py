"""Run one shopping-assistant query."""

from __future__ import annotations

import argparse
import json

from agent import OpenRouterError, run_agent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="The shopping request to send to the agent.")
    parser.add_argument("--show-trace", action="store_true", help="Print raw model/tool events.")
    args = parser.parse_args()
    try:
        final_text, trajectory, cart_product_id = run_agent(args.query)
    except OpenRouterError as error:
        parser.error(str(error))
    print(f"\nCart product: {cart_product_id or 'none'}")
    print(f"\nFinal answer\n{final_text}")
    if args.show_trace:
        print("\nTrace")
        print(json.dumps(trajectory, indent=2))


if __name__ == "__main__":
    main()
