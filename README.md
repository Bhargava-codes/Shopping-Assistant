# Shopping Agent Evaluation

This repo contains a small shopping assistant. The agent can search a local catalogue, inspect
product details and reviews, and add one product to a cart.

Start by improving the agent so it chooses the right product more often. If time remains, the
interviewer may ask you to scope and build a review-insights improvement.

## What The Score Means

Run the benchmark:

```bash
python eval/evaluate.py
```

It prints a result like:

```text
PASSED X / 18  (Y%)
```

Each case is one shopper request. A case passes only when the final product added to the cart
matches the hard requirements for that request:

- correct product category
- within budget
- high enough rating
- in stock when required
- required features are present

The score is intentionally simple: it only checks the final cart product. The traces are there to
help you understand how the agent got there.

## Where The Cases Come From

The 18 cases in `data/test_cases.json` are seeded examples of common shopping-agent mistakes:

- going over budget
- choosing the first plausible result too quickly
- trusting a product without verifying specifications
- ignoring review quality
- adding out-of-stock items

Every case has at least one valid product in the local catalogue. The task is to make the agent find
those products more reliably.

## What You May Change

For the benchmark, focus on the agent behavior:

- `src/agent.py` for the system prompt and agent loop
- `src/tools.py` for tool descriptions and schemas

For the review-insights task, you may also change:

- `data/reviews.json` for richer review examples
- `web/` for browser UI changes
- `src/web.py` for local UI endpoints

You may use any AI tooling you like.

## Do Not Change

- `data/products.json`
- `data/test_cases.json`
- `eval/evaluate.py`

If a case or scoring rule seems wrong, bring it up during the interview instead of editing it.

## Setup

Requirements: Python 3.10+ and an OpenRouter API key. The interviewer will provide the key if
needed.

```bash
cp .env.example .env
# Set OPENROUTER_API_KEY in .env
python -m pip install -r requirements.txt
python eval/evaluate.py
```

The benchmark uses `google/gemini-3.1-flash-lite` so runs are comparable. Do not change
`BENCHMARK_MODEL` while working on the score.

## Inspect Failures

Each benchmark run writes traces under `eval/results/<timestamp>/`. These traces show:

- the shopper request
- the product the agent added
- which constraints passed or failed
- the agent's tool calls and steps

You can inspect runs in the browser:

```bash
python src/web.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000), click **Refresh score**, then inspect failed
cases.

You can also run one request directly:

```bash
python src/run_agent.py "Find me a wireless mouse under 2000 with good reviews"
```

## Review-Insights Task

The catalogue has ratings and short review snippets. `data/reviews.json` adds richer review examples
for selected products across mice, keyboards, headphones, webcams, and monitors.

You can browse that data in the local UI:

```bash
python src/web.py
```

Open [http://127.0.0.1:8000/reviews](http://127.0.0.1:8000/reviews).

A useful review feature should help a shopper understand the evidence behind a recommendation. For
example, it might:

- summarize review signals for one product
- separate positives from risks
- adapt the review attributes by category
- explain whether the reviews support the shopper's stated need
- change the agent's final answer so it cites review evidence clearly

The goal is not to build a full reviews platform. Pick a small slice, make it work, and be ready to
explain what you chose not to build.

## Repo Map

- `data/products.json`: local product catalogue
- `data/reviews.json`: richer review examples for the review-insights task
- `data/test_cases.json`: benchmark cases
- `src/tools.py`: local tools and tool schemas
- `src/agent.py`: model client and agent loop
- `src/run_agent.py`: CLI for one-off runs
- `src/web.py`: local browser UI
- `web/reviews.html`: product and review browser
- `eval/evaluate.py`: benchmark runner
