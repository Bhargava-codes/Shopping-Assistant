"""Local setup checks for the shopping-agent interview project."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def ok(message: str) -> None:
    print(f"[OK] {message}")


def warn(message: str) -> None:
    print(f"[WARN] {message}")


def fail(message: str) -> None:
    print(f"[FAIL] {message}")


def read_env_file() -> dict[str, str]:
    env_path = ROOT / ".env"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def check_python() -> bool:
    version = sys.version_info
    if version >= (3, 10):
        ok(f"Python {version.major}.{version.minor}.{version.micro}")
        return True
    fail(f"Python 3.10+ required, found {version.major}.{version.minor}.{version.micro}")
    return False


def check_dependency(module: str, package: str) -> bool:
    if importlib.util.find_spec(module):
        ok(f"Dependency installed: {package}")
        return True
    fail(f"Missing dependency: {package}. Run `make setup`.")
    return False


def check_env() -> bool:
    env_values = read_env_file()
    env_path = ROOT / ".env"
    if env_path.exists():
        ok(".env exists")
    else:
        fail(".env is missing. Run `cp .env.example .env` and add OPENROUTER_API_KEY.")
        return False

    api_key = os.getenv("OPENROUTER_API_KEY") or env_values.get("OPENROUTER_API_KEY", "")
    if api_key and not api_key.endswith("..."):
        ok("OPENROUTER_API_KEY is set")
        return True
    fail("OPENROUTER_API_KEY is missing or still the placeholder value in .env")
    return False


def check_files() -> bool:
    required_paths = [
        "README.md",
        "AGENTS.md",
        "CLAUDE.md",
        "AI_ASSISTANT_BRIEF.md",
        "data/products.json",
        "data/test_cases.json",
        "data/reviews.json",
        "src/agent.py",
        "src/tools.py",
        "eval/evaluate.py",
    ]
    missing = [path for path in required_paths if not (ROOT / path).exists()]
    if missing:
        fail(f"Missing required files: {', '.join(missing)}")
        return False
    ok("Required project files are present")
    return True


def check_json_fixture(path: str) -> bool:
    try:
        json.loads((ROOT / path).read_text())
    except Exception as error:
        fail(f"{path} is not valid JSON: {error}")
        return False
    ok(f"{path} is valid JSON")
    return True


def run_command(args: list[str], label: str) -> bool:
    try:
        result = subprocess.run(
            args,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=20,
            check=False,
        )
    except Exception as error:
        fail(f"{label} could not run: {error}")
        return False
    if result.returncode == 0:
        ok(label)
        if result.stdout.strip():
            print(result.stdout.strip())
        return True
    fail(label)
    if result.stdout.strip():
        print(result.stdout.strip())
    return False


def check_interviewer_only_solution() -> None:
    solution_path = ROOT / "solution"
    if solution_path.exists():
        warn("`solution/` exists locally. Candidate AI tools should not inspect or use it.")


def main() -> int:
    print("Shopping Agent Eval doctor\n")
    checks = [
        check_python(),
        check_dependency("dotenv", "python-dotenv"),
        check_files(),
        check_json_fixture("data/products.json"),
        check_json_fixture("data/test_cases.json"),
        check_json_fixture("data/reviews.json"),
        check_env(),
        run_command(
            [sys.executable, "eval/evaluate.py", "--validate-fixture"],
            "Fixture validation passes",
        ),
    ]
    check_interviewer_only_solution()

    print("")
    if all(checks):
        ok("Setup looks ready. Next: `make eval` or `make web`.")
        return 0
    fail("Setup needs attention before the benchmark will run cleanly.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
