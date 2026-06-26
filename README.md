# Shopping Agent Evaluation

You own a shopping-assistant agent. It can search a local catalogue, inspect product details and
reviews, and add one product to a cart. The current version works, but its offline evaluation is
mediocre. Your job is to make it better — and to think like the PM who owns it.

**Time box: ~1 hour.** Use any AI tooling you like. Narrate the choices you make.

## The task

1. **Move the score.** Improve the agent so it passes more of the 18 evaluation cases. You may
   change:
   - the system prompt (`src/agent.py`)
   - the tool descriptions / schemas (`src/tools.py`)
   - the loop logic (`src/agent.py`)
2. **Write up your thinking** in [`SUBMISSION.md`](SUBMISSION.md) (template provided). This matters
   as much as the score — we are hiring a product manager, not just a prompt.

### Do not change
- `data/products.json` (the catalogue)
- `data/test_cases.json` (the evaluation fixture)
- the scoring logic in `eval/evaluate.py`

If you think the scoring or fixture is wrong or incomplete, **say so in `SUBMISSION.md`** rather
than editing it.

## Candidate flow

This exercise has two surfaces with different jobs:

1. **Benchmark in the terminal — this is the score of record.** Start by running the full 18-case
   evaluation. It prints `PASSED X / 18 (Y%)` and writes one trace per case under
   `eval/results/<timestamp>/`.
2. **Investigate in the browser — this is where you diagnose.** After a benchmark run, click
   **Inspect** on any case to open its persisted trace: a per-constraint pass/fail breakdown (the
   exact reason it failed), the product the agent added, and the full step-by-step trajectory
   (what it searched, what it opened, what it added). This is how you explain *why* the score
   moved instead of blindly iterating on prompts. You can also load a fixture into the playground
   and run it live for exploration.
3. **Change the agent**, then rerun the same full terminal benchmark.
4. **Write the product judgment** in `SUBMISSION.md`: what changed, which evidence supports it,
   what the score misses, and what you would do before production.

The playground and the benchmark both run on the same pinned, latest model
(`google/gemini-3.1-flash-lite`) so scores are comparable and you **cannot** move the score by
swapping models. Do not change `BENCHMARK_MODEL`. Changing the playground model in the browser is
fine for exploration, but it does **not** make a comparable benchmark result.

## Setup

Requirements: Python 3.10+ and an OpenRouter API key for a tool-capable model (we provide one).

```bash
cp .env.example .env
# Set OPENROUTER_API_KEY in .env
python -m pip install -r requirements.txt
python eval/evaluate.py                # baseline: wait for all 18 cases
```

Both the playground and the benchmark are pinned to `google/gemini-3.1-flash-lite`. The key stays
local; it is never committed. Your baseline score is the final line printed by
`python eval/evaluate.py`, not a subjective UI impression.

## Interactive UI

Run the local operator console to inspect individual failures in a browser:

```bash
python src/web.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The console fetches the live OpenRouter model
catalog through the local server, lets you load an evaluation fixture, run the agent, inspect every
tool call, and see actual latency and cost. It also shows the latest **complete** CLI benchmark and
lists every case with its verdict. After a terminal benchmark, click **Refresh score**, then
**Inspect** any case to open its persisted trace — the per-constraint pass/fail diagnosis, the
product the agent added, and the full trajectory. The browser never receives `OPENROUTER_API_KEY`.

To try one request and inspect the trace:

```bash
python src/run_agent.py "Find me a wireless mouse under 2000 with good reviews"
```

## What to submit

1. Work on **your own branch**.
2. **Commit your baseline run first.** Run `python eval/evaluate.py` before making changes, so we
   can see the starting score and traces. Then commit the final run after your changes. Both land
   in `eval/results/`.
3. Fill in [`SUBMISSION.md`](SUBMISSION.md), including both scores and trace directories.
4. Push your branch and share it with us.

## Repo map

- `data/products.json`: local product catalogue.
- `data/test_cases.json`: evaluation fixture (18 cases).
- `src/tools.py`: local tool implementations and tool schemas.
- `src/agent.py`: model client and agent loop.
- `src/run_agent.py`: CLI for inspecting individual runs.
- `eval/evaluate.py`: runs the evaluation and writes trace files under `eval/results/`.

## Codespaces

If local Python setup is a problem, open this repository in GitHub Codespaces. The included dev
container installs the only Python dependency automatically; you still need to configure
`OPENROUTER_API_KEY` as a Codespaces secret or in the environment.
