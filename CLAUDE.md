# Claude Instructions

This repo is a shopping-agent interview exercise. Follow the same project rules as `AGENTS.md`.

## Main Guardrails

Never edit these benchmark fixtures or scoring code during candidate work:

- `data/products.json`
- `data/test_cases.json`
- `eval/evaluate.py`

Do not change `BENCHMARK_MODEL` for score gains.

Do not write secrets into the repo. `.env` is local and should not be committed.

## Where To Work

Benchmark improvements usually belong in:

- `src/agent.py`
- `src/tools.py`

Update `SUBMISSION.md` with concise notes when making interview changes.

## How To Run

If helping a candidate during a live interview, read `AI_ASSISTANT_BRIEF.md` first.

Install dependencies:

```bash
make setup
```

Or directly:

```bash
python -m pip install -r requirements.txt
```

Run the benchmark:

```bash
make eval
```

Or directly:

```bash
python eval/evaluate.py
```

Then inspect the generated summary:

```bash
cat eval/results/<timestamp>/summary.md
```

Or start the browser review UI:

```bash
make web
```

Then open `http://127.0.0.1:8000`.

Validate fixture only:

```bash
python eval/evaluate.py --validate-fixture
```

Run one query:

```bash
python src/run_agent.py "Find me a quiet wireless keyboard under 1600 for an office"
```

## Working Style

- Ground recommendations in the benchmark review UI, generated summary, and hard-constraint failures.
- If this is being used in an interview, coach rather than solve: point to files, summary output, commands, and failure reasons, but do not provide a complete replacement prompt, full implementation, exact fixture answers, or hard-coded product choices.
- Inspect `eval/results/<timestamp>/summary.md` before changing agent behavior.
- Inspect local tool behavior before assuming the model alone is wrong: retrieval, product details, reviews, and cart actions can each affect the final result.
- Keep changes small and explainable.
- Verify hard constraints before adding any product to cart.
- Do not hard-code exact answers for the seeded test cases.
- Prefer improving general selection behavior over fixture-specific hacks.
