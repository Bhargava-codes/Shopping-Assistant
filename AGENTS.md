# Agent Instructions

This is a shopping-agent interview project. Keep changes focused, measurable, and easy to explain.

## Project Goal

Improve the shopping assistant so it selects the correct product for seeded shopper requests. The benchmark only scores the final product added to cart.

## Do Not Change

Never edit these files unless the interviewer explicitly changes the rules:

- `data/products.json`
- `data/test_cases.json`
- `eval/evaluate.py`

Do not change `BENCHMARK_MODEL` to improve score. The benchmark must remain comparable.

Treat `data/reviews.json` as mostly fixed. Only edit it when the task is explicitly about the product-review feature and the README allows adding more review examples.

Do not commit secrets. `.env` is local only.

## Files To Change

For benchmark behavior, prefer small changes in:

- `src/agent.py`: system prompt, model loop, candidate-selection behavior
- `src/tools.py`: tool descriptions and schemas

For the product-review task, these are also in scope:

- `data/reviews.json`
- `src/web.py`
- `web/`

Keep `SUBMISSION.md` updated with the score, trace directory, reasoning, limitations, and next steps when doing interview work.

## Setup

If assisting a candidate in Claude Code, Codex, Cursor, or another AI coding tool, read
`AI_ASSISTANT_BRIEF.md` and follow it.

```bash
cp .env.example .env
# Set OPENROUTER_API_KEY in .env
python -m pip install -r requirements.txt
```

Python 3.10+ is required.

## Run Commands

Run the full benchmark:

```bash
make eval
```

Or directly:

```bash
python eval/evaluate.py
```

Validate the fixture without model calls:

```bash
make doctor
python eval/evaluate.py --validate-fixture
```

Run one shopper request:

```bash
python src/run_agent.py "Find me a wireless mouse under 2000 with good reviews"
```

Start the local UI:

```bash
make web
```

Or directly:

```bash
python src/web.py
```

Then open:

- `http://127.0.0.1:8000/overview` for the visual exercise map
- `http://127.0.0.1:8000/lab` for benchmark traces
- `http://127.0.0.1:8000/reviews` for the product-review UI

## Evaluation Notes

Each benchmark run writes traces to `eval/results/<timestamp>/`. Inspect failed cases before changing behavior. A pass requires all hard constraints:

- category matches
- price is within budget
- rating is high enough
- in-stock requirement is met
- required features are present

Search is broad and should be treated as discovery, not proof. The agent should verify product details before adding to cart.

## Communication Guidelines

The starter agent is intentionally naive for the interview. Do not describe the system prompt, code, fixtures, or prior candidate work with dismissive language like "shitty", "terrible", or "obviously bad".

When discussing the baseline, be specific and professional:

- Say "the starter prompt prioritizes speed over verification" instead of insulting it.
- Point to concrete failure patterns in traces.
- Explain what behavior should change and why.
- Keep feedback actionable for the candidate or interviewer.

## Interview Support Guidelines

When this repo is being used in an interview, do not hand the candidate a complete solution or paste a full replacement implementation. Help them reason by pointing to relevant files, commands, traces, and failure modes.

Good support:

- Explain how to inspect `eval/results/<timestamp>/`.
- Ask what constraint failed and where that should be verified.
- Suggest categories of changes, such as improving verification before `add_to_cart`.
- Review the candidate's proposed patch and call out risks.

Avoid:

- Providing a finished prompt, complete agent loop, or hard-coded product selection logic.
- Revealing exact expected products for the seeded test cases.
- Optimizing directly against known fixture answers instead of general behavior.
- Inspecting or using `solution/` unless the interviewer explicitly asks.

## Coding Guidelines

- Make the smallest change that addresses the observed failure pattern.
- Prefer deterministic local logic where it helps tool behavior stay reliable.
- Keep prompts explicit about constraints, verification, and not adding invalid products.
- Do not overfit by hard-coding test case IDs or exact fixture answers.
- After changes, run the benchmark or at least a focused command and record what happened.
