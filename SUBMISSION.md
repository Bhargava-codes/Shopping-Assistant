# Submission

> Fill this in as you work. Keep it concise. We care about your reasoning, not length.

## Scores

| | Score | Trace dir (under `eval/results/`) |
|---|---:|---|
| Baseline (before changes) | 1 / 18 | `20260710T140557Z` |
| Final (after changes) | 18 / 18 | `20260710T145531Z` |

Model: `google/gemini-3.1-flash-lite`. (Local runs need the CA bundle:
`SSL_CERT_FILE="$(python3 -c 'import certifi; print(certifi.where())')" python3 eval/evaluate.py`.)

## 1. How the current agent works

`src/run_agent.py` / `eval/evaluate.py` send the shopper query with a system prompt to the model via
OpenRouter (`src/agent.py`). The model calls local deterministic tools in `src/tools.py`
(`search_products`, `get_product_details`, `get_reviews`, `add_to_cart`) in a loop (`MAX_STEPS`), and
the evaluator scores only the final cart product against the case's hard constraints (category,
price ≤ budget in ₹, rating ≥ min, in stock, all required features).

## 2. What failed and why

Baseline scored 1/18. The loop hard-coded "search once → add `result[0]` → stop," and the prompt
literally instructed that. So:
- **tc_013 "monitor for fast games":** added a gaming *mouse* (wrong category, missing 144hz/ips).
- **tc_005 "full-size mechanical keyboard":** added a *membrane* keyboard (rating 3.9<4.5, missing mechanical).
- **tc_006 "quiet wireless keyboard":** added an out-of-stock *mouse* (wrong category + OOS).

Blocker frequency across the 17 failures: Features 16, Category 11, Rating 11, Stock 4, Budget 0
(full per-case table in `eval/results/20260710T140557Z/ANALYSIS.md`).

## 3. Tool and data assumptions checked

- `search_products` returned only id/name/category/price/in_stock/rating (no `features`) and matched
  on ANY query token, first-8 in catalogue order — so it leaked categories and hid features.
- `get_product_details` converts price to **USD** (`price/83`, `currency:"USD"`) while budgets/evaluator
  use raw **INR** — a unit trap. `search_products.price` is the raw ₹ value.
- `get_reviews` returns only positive (rating ≥ 4) snippets — not full evidence.
- `add_to_cart` only validates the id exists; it does not enforce constraints.

## 4. What I changed and why

Smallest set of changes targeting the observed failures:
1. **`src/agent.py` prompt:** replaced the "add top result" instruction with an explicit
   restate-constraints → category-filter → verify-with-details → add-only-if-all-pass procedure, and
   flagged the ₹-vs-USD trap and positive-only reviews.
2. **`src/agent.py` loop:** removed the hard-coded auto-add of `result[0]` so the model controls the
   cart decision after verification (still tracks `add_to_cart` for the evaluator).
3. **`src/tools.py` retrieval:** return `features` in search hits; rank by relevance
   (category > feature > name) instead of first-match; and raise the result cap from 8 → 20 so a
   category search returns all ~10 items in that category. The cap fix specifically closed tc_014,
   where the only valid 1440p/144hz monitor (p_509) had been ranked out of the top 8, causing a false
   "nothing qualifies."

Result: 1/18 → 17/18 (`20260710T145417Z`) → 18/18 (`20260710T145531Z`).

## 5. How the agent should decide

Treat catalogue fields as authoritative for hard constraints (category, ₹ price, rating, stock,
required features) and reject any product that misses even one. Use reviews only to break ties or to
judge subjective wording ("quiet", "reliable focus", "all-day comfort"), never to override a hard
constraint. Prefer the highest-rated qualifying product when several pass.

## 6. What the score does not tell us

The score is pass/fail on hard constraints for one cart item. It does not capture how well the
*subjective* need was met (was the "quiet" pick actually the quietest option?), value-for-money,
whether the explanation was faithful to the evidence, latency/cost, or graceful behavior when no
product qualifies. I'd also measure evidence-citation accuracy and hallucination rate.

## 7. Overfitting and held-out checks

No test-case IDs or fixture answers are hard-coded — all changes are general (prompt procedure,
relevance ranking, result cap, returning features). To check generalization I'd add unseen requests:
multi-constraint edge cases, requests where nothing qualifies (should decline, not force-add),
conflicting/soft constraints, and new categories/feature vocab.

## 8. Remaining limitations and next steps

1. Fix the ₹/USD trap at the source (make `get_product_details` return a clearly-labeled ₹ price, or
   add a currency-agnostic field) so correctness doesn't rely on the prompt warning.
2. Return negative reviews too (or a rating distribution) so subjective judgments use full evidence.
3. Add a light server-side guardrail so `add_to_cart` can flag a constraint mismatch, reducing
   reliance on the model following the procedure perfectly.
4. Expand the eval with held-out and "no valid product" cases to measure generalization and decline behavior.
