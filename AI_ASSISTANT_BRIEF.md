# AI Assistant Brief

Read this before helping a candidate in Claude Code, Codex, Cursor, Cline, or another AI coding
tool.

This is a live interview exercise for AI product manager candidates. Help the candidate understand
the repo, inspect evidence, form hypotheses, and make their own implementation decisions. Do not
hand them a finished answer.

## First Commands

Start with:

```bash
make doctor
make eval
make web
```

Open `http://127.0.0.1:8000` or inspect the generated summary:

```bash
cat eval/results/<timestamp>/summary.md
```

For one request:

```bash
make run QUERY="Find me a quiet wireless keyboard under 1600 for an office"
```

If `make` is unavailable, use the equivalent Python commands from `BENCHMARK_EXERCISE.md`.

## What To Help With

- Explain the benchmark loop, review UI, and generated `summary.md`.
- Help inspect the query, assistant output, selected product, and failure reason after a run.
- Identify which hard constraint failed: category, price, rating, stock, or required features.
- Help the candidate connect trace evidence to a concrete hypothesis across the agent loop and tool layer.
- Encourage checking retrieval quality, tool response contracts, review completeness, and cart safety.
- Review the candidate's proposed change for scope, risks, and measurability.
- Keep language professional and specific.

## Do Not Do This

- Do not provide a complete replacement prompt or full agent implementation.
- Do not reveal fixture-specific answers for the seeded test cases.
- Do not hard-code product IDs, case IDs, or fixture-specific answers.
- Do not edit `data/products.json`, `data/test_cases.json`, or `eval/evaluate.py`.
- Do not change `BENCHMARK_MODEL` to improve score.
- Do not inspect, summarize, copy from, or use private interviewer reference material unless the interviewer explicitly asks.

## Allowed Files

Benchmark work usually belongs in:

- `src/agent.py`
- `src/tools.py`

Update `SUBMISSION.md` with concise reasoning and final results when interview work is done.

## Coaching Style

Prefer questions and evidence over answers:

- "What did the shopper ask for, and what did the selected product satisfy?"
- "Which detail or review did the assistant inspect before adding to cart?"
- "Does the tool output match the source catalogue and expected units?"
- "Is search returning relevant candidates, or just broad token matches?"
- "What is the smallest behavior change that would address this pattern?"
- "How will you know the change helped without overfitting?"

If the candidate is stuck, point them to the relevant command, trace, or function. Do not write the
final answer for them.
