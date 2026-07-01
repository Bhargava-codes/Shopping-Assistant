# Agent Instructions

This is a shopping-agent interview project. Keep changes focused, measurable, and easy to explain.

## Project Goal

Improve the shopping assistant so it selects a product that fits shopper requests using catalogue
details, reviews, and local tools. The benchmark scores the final product added to cart.

## Do Not Change

Never edit these files during candidate work unless the interviewer explicitly changes the rules:

- `data/products.json`
- `data/test_cases.json`
- `eval/evaluate.py`

Do not change `BENCHMARK_MODEL` to improve score. The benchmark must remain comparable.

Treat `data/reviews.json` as mostly fixed. Only edit it when the task is explicitly about review
evidence.

Do not commit secrets. `.env` is local only.

## Files To Change

For benchmark behavior, prefer small changes in:

- `src/agent.py`: model instructions, loop behavior, candidate-selection behavior
- `src/tools.py`: retrieval, product-detail, review, and cart tool behavior

Keep `SUBMISSION.md` updated with the score, trace directory, reasoning, limitations, and next
steps when doing interview work.

## Setup

If assisting a candidate in Claude Code, Codex, Cursor, Cline, or another AI coding tool, read
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
python src/run_agent.py "Find me a quiet wireless keyboard under 1600 for an office"
```

Start the local review UI:

```bash
make web
```

Then open `http://127.0.0.1:8000`.

## Evaluation Notes

Each benchmark run can be inspected in the local UI and also writes
`eval/results/<timestamp>/summary.md`. Inspect one of those before changing behavior. A pass
requires all hard constraints:

- category matches
- price is within budget
- rating is high enough
- in-stock requirement is met
- required features are present

Search is broad and should be treated as discovery, not proof. The assistant should inspect product
details and review evidence before making a final cart decision. Tool outputs should be checked
against source catalogue data when units, filtering, or field meanings are unclear.

## Communication Guidelines

When discussing the baseline, be specific and professional:

- Point to concrete trace evidence.
- Explain what behavior should change and why.
- Keep feedback actionable for the candidate or interviewer.

## Interview Support Guidelines

When this repo is being used in an interview, do not hand the candidate a complete solution or paste
a full replacement implementation. Help them reason by pointing to relevant files, commands, traces,
and failure modes.

Good support:

- Explain how to inspect the benchmark review UI or `eval/results/<timestamp>/summary.md`.
- Ask what constraint failed and what evidence was checked before the cart decision.
- Suggest categories of changes, such as improving retrieval, tool contracts, verification, review evidence, cart safety, or selection criteria.
- Review the candidate's proposed patch and call out risks.

Avoid:

- Providing a finished prompt, complete agent loop, or hard-coded product selection logic.
- Revealing fixture-specific answers for the seeded test cases.
- Optimizing directly against known fixture answers instead of general behavior.
- Inspecting or using private interviewer reference material unless the interviewer explicitly asks.

## Coding Guidelines

- Make the smallest change that addresses the observed failure pattern.
- Prefer deterministic local logic where it helps tool behavior stay reliable.
- Keep prompts explicit about constraints, verification, and not adding invalid products.
- Do not overfit by hard-coding test case IDs or exact fixture answers.
- After changes, run the benchmark or at least a focused command and record what happened.
