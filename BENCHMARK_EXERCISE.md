> This is the original AI-PM interview exercise doc for this repo (benchmark scoring, setup,
> what's off-limits during candidate work). See [README.md](README.md) for the ElecKart storefront
> product spec that was built on top of this exercise's catalogue.

# Shopping Agent Evaluation

This repo contains a small shopping assistant. The agent can search a local catalogue, inspect
product details and reviews, and add one product to a cart.

Your task is to improve the assistant's product choice quality for shopper requests. We care about
both the final benchmark result and how you reason about product fit, evidence, and trade-offs.

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

The score checks the final cart product. Each run also writes a short summary and can be inspected
in the local browser UI. Both views focus on the shopper query, assistant output, selected product,
and why the case failed.

## Working The Exercise

Start by running the benchmark and inspecting the result before editing. Look for:

- what the shopper asked for
- what the assistant replied
- which product was selected
- why the selected product was wrong, if it failed
- whether retrieval returned the right candidates
- whether tool outputs match the catalogue source and expected units
- whether review evidence is complete enough to trust
- whether the cart action should accept the selected product

Make a small, explainable improvement. Avoid hard-coding case IDs, product IDs, or fixture-specific
answers. The goal is a general shopping-assistant behavior that would still make sense on new
shopper requests.

## What You May Change

For the benchmark, focus on the agent behavior:

- `src/agent.py` for the model instructions and agent loop
- `src/tools.py` for retrieval, product-detail, review, and cart tool behavior

You may use any AI tooling you like.

## Do Not Change During The Interview

- `data/products.json`
- `data/test_cases.json`
- `eval/evaluate.py`

If a case or scoring rule seems wrong, bring it up during the interview instead of editing it.

## Setup

Requirements: Python 3.10+ and an OpenRouter API key. The interviewer will provide the key if
needed.

If you are using Claude Code, Codex, Cursor, Cline, or another AI coding tool, ask it to read
`AI_ASSISTANT_BRIEF.md` first.

```bash
cp .env.example .env
# Set OPENROUTER_API_KEY in .env
python -m pip install -r requirements.txt
python eval/evaluate.py
```

You can also use the shortcut commands:

```bash
make doctor
make setup
make eval
make web
```

The benchmark uses `google/gemini-3.1-flash-lite` so runs are comparable. Do not change
`BENCHMARK_MODEL` while working on the score.

## Inspect Failures

Each benchmark run writes files under `eval/results/<timestamp>/`.

Start the local UI:

```bash
make web
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The benchmark review page shows each case,
the shopper query, assistant output, selected product, and why the output was wrong. It also includes
a product catalogue view for specs and review snippets.

You can also inspect the same run in the terminal:

```bash
cat eval/results/<timestamp>/summary.md
```

You can also open that markdown file in your editor if you prefer.

If you need the latest run directory:

```bash
ls -t eval/results | head
```

The per-case JSON files are still available if you need deeper debugging, but the intended first
inspection is the review UI or summary: query, assistant output, selected product, and why it was
wrong.

You can also run one request directly:

```bash
python src/run_agent.py "Find me a quiet wireless keyboard under 1600 for an office"
```

## Repo Map

- `data/products.json`: local product catalogue
- `data/reviews.json`: review examples available to the agent
- `data/test_cases.json`: benchmark cases
- `src/tools.py`: local tools and tool schemas
- `src/agent.py`: model client and agent loop
- `src/run_agent.py`: CLI for one-off runs
- `src/web.py`: local benchmark review UI
- `web/`: browser UI for benchmark review and product catalogue
- `eval/evaluate.py`: benchmark runner
