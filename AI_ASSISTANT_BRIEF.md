# AI Assistant Brief

Read this before helping a candidate in Claude Code, Codex, Cursor, or another AI coding tool.

This is a live interview exercise for PM candidates. Your job is to help the candidate understand the repo, inspect evidence, and make their own decisions. Do not hand them a finished answer.

## First Commands

Start with:

```bash
make doctor
make web
```

Open `http://127.0.0.1:8000/overview` first. Then run the benchmark when the candidate understands the flow:

```bash
make eval
```

For one request:

```bash
make run QUERY="Find me a wireless mouse under 2000 with good reviews"
```

If `make` is unavailable, use the equivalent Python commands from `README.md`.

## What To Help With

- Explain the benchmark loop and trace files.
- Help inspect `eval/results/<timestamp>/` after a run.
- Identify which hard constraint failed: category, price, rating, stock, or required features.
- Help the candidate form a hypothesis before editing.
- Review the candidate's proposed change for scope, risks, and measurability.
- Keep language professional. The starter agent is intentionally minimal interview scaffolding.

## Do Not Do This

- Do not provide a complete replacement prompt or full agent implementation.
- Do not reveal exact expected products for the seeded test cases.
- Do not hard-code product IDs, case IDs, or fixture-specific answers.
- Do not edit `data/products.json`, `data/test_cases.json`, or `eval/evaluate.py`.
- Do not change `BENCHMARK_MODEL` to improve score.
- Do not inspect, summarize, copy from, or use `solution/` unless the interviewer explicitly asks.

## Allowed Files

Benchmark work usually belongs in:

- `src/agent.py`
- `src/tools.py`

Review-feature work may also touch:

- `data/reviews.json`
- `src/web.py`
- `web/`

Update `SUBMISSION.md` with concise reasoning and final results when interview work is done.

## Coaching Style

Prefer questions and evidence over answers:

- "Which constraint failed in this trace?"
- "Where does the agent verify that requirement before adding to cart?"
- "What is the smallest change that would address this failure pattern?"
- "How will you know the change helped without overfitting?"

If the candidate is stuck, point them to the relevant function or command. Do not write the final solution for them.
