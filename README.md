# Shopping Agent Evaluation

You own a shopping-assistant agent that can search a local catalogue, inspect product details and reviews, and add one product to a cart. The current version works, but its offline evaluation is mediocre.

Your task is to improve the agent and move the score. You may change the system prompt, tool descriptions, and loop logic. Keep the local tools and the evaluation fixture intact. Use any AI tooling you find useful, and narrate the choices you make.

## Setup

Requirements: Python 3.10+ and an OpenRouter API key for a tool-capable model.

```bash
cp .env.example .env
# Set OPENROUTER_API_KEY in .env
python -m pip install -r requirements.txt
python eval/evaluate.py
```

To try one request and inspect the trace:

```bash
python src/run_agent.py "Find me a wireless mouse under 2000 with good reviews"
```

The default model is `openai/gpt-4o-mini`. You may change `OPENROUTER_MODEL` in `.env` to another tool-capable model available to your account. The key stays local; it is never committed or sent to the browser.

## Repo map

- `data/products.json`: local product catalogue.
- `data/test_cases.json`: evaluation fixture.
- `src/tools.py`: local tool implementations and tool schemas.
- `src/agent.py`: model client and agent loop.
- `src/run_agent.py`: CLI for inspecting individual runs.
- `eval/evaluate.py`: runs the evaluation and writes trace files under `eval/results/`.

## Interview constraints

Work directly on your own branch. Please do not modify the catalogue, test cases, or evaluation scoring. At the end, explain the evidence behind your approach, the remaining limitations, and what you would validate before a production pilot.

## Codespaces

If local Python setup is a problem, open this repository in GitHub Codespaces. The included dev container installs the only Python dependency automatically; you still need to configure `OPENROUTER_API_KEY` as a Codespaces secret or in the environment.

