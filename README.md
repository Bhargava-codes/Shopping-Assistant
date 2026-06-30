# Shopping Agent Evaluation

This repo contains a small shopping assistant. The agent can search a local catalogue, inspect
product details and reviews, and add one product to a cart.

Start by improving the agent so it chooses the right product more often. If time remains, the
interviewer may ask you to improve how product reviews help shoppers decide.

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

The starter agent is intentionally simple and should be treated as a baseline, not production
guidance.

For the benchmark, focus on the agent behavior:

- `src/agent.py` for the system prompt and agent loop
- `src/tools.py` for tool descriptions and schemas

For the product-review task, you may also change:

- `data/reviews.json` for review examples
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

## Product-Review Task

The product page currently shows basic product information and a simple list of reviews: star
rating, use case, and review text. The reviews are intentionally raw. There is no tagging,
summarization, or category-specific logic yet.

You can browse the current product page in the local UI:

```bash
python src/web.py
```

Open [http://127.0.0.1:8000/reviews](http://127.0.0.1:8000/reviews).

A useful improvement should help a shopper decide whether a product is worth buying. For example,
it might:

- summarize what buyers like and dislike
- highlight repeated issues or risks
- adapt the summary to the product category
- explain whether the reviews support a shopper's specific need
- change the agent's final answer so it uses review evidence clearly

If the review data feels too thin for your idea, you may add more examples to `data/reviews.json`.
The goal is not to build a full reviews platform. Pick a small slice, make it work, and be ready to
explain what you chose not to build.

## Repo Map

- `data/products.json`: local product catalogue
- `data/reviews.json`: review examples for the product-review task
- `data/test_cases.json`: benchmark cases
- `src/tools.py`: local tools and tool schemas
- `src/agent.py`: model client and agent loop
- `src/run_agent.py`: CLI for one-off runs
- `src/web.py`: local browser UI
- `web/reviews.html`: product listing and product detail page
- `eval/evaluate.py`: benchmark runner
