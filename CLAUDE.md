# Claude Instructions

This repo is a shopping-agent interview exercise. Follow the same project rules as `AGENTS.md`.

## Main Guardrails

Never edit these benchmark fixtures or scoring code:

- `data/products.json`
- `data/test_cases.json`
- `eval/evaluate.py`

Do not change `BENCHMARK_MODEL` for score gains.

Only edit `data/reviews.json` if the current task is explicitly the product-review task from the README.

Do not write secrets into the repo. `.env` is local and should not be committed.

## Where To Work

Benchmark improvements usually belong in:

- `src/agent.py`
- `src/tools.py`

Product-review improvements may also touch:

- `data/reviews.json`
- `src/web.py`
- `web/`

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

Validate fixture only:

```bash
python eval/evaluate.py --validate-fixture
```

Run one query:

```bash
python src/run_agent.py "Find me a wireless mouse under 2000 with good reviews"
```

Start the local browser UI:

```bash
make web
```

Or directly:

```bash
python src/web.py
```

Open `http://127.0.0.1:8000/overview` for the visual exercise map, `http://127.0.0.1:8000/lab` for traces, or `http://127.0.0.1:8000/reviews` for the review UI.

## Working Style

- Treat the starter prompt and loop as intentionally naive interview scaffolding. Do not call them "shitty", "terrible", or use dismissive language.
- Describe issues in concrete terms, for example: "the starter prompt tells the agent to choose the first search result without verification."
- Ground recommendations in trace evidence and hard-constraint failures.
- If this is being used in an interview, coach rather than solve: point to files, traces, commands, and failure modes, but do not provide a complete replacement prompt, full implementation, exact fixture answers, or hard-coded product choices.
- Do not inspect or use `solution/` unless the interviewer explicitly asks.
- Inspect `eval/results/<timestamp>/` traces before changing agent behavior.
- Keep changes small and explainable.
- Verify hard constraints before adding any product to cart.
- Do not hard-code exact answers for the seeded test cases.
- Prefer improving general selection behavior over fixture-specific hacks.
