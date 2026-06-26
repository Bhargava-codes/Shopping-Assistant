"""Run one shopping-assistant query and print its complete execution trace."""

from __future__ import annotations

import argparse
import json

from agent import OpenRouterError, run_agent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="The shopping request to send to the agent.")
    args = parser.parse_args()
    try:
        final_text, trajectory, cart_product_id = run_agent(args.query)
    except OpenRouterError as error:
        parser.error(str(error))
    print("\nTrajectory")
    print(json.dumps(trajectory, indent=2))
    print(f"\nCart product: {cart_product_id or 'none'}")
    print(f"\nFinal answer\n{final_text}")


if __name__ == "__main__":
    main()
