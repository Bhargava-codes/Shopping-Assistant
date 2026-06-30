PYTHON ?= python
QUERY ?= Find me a wireless mouse under 2000 with good reviews

.PHONY: help doctor setup check eval eval-fast run web

help:
	@echo "Shopping Agent Eval commands"
	@echo ""
	@echo "  make doctor              Check local setup without model calls"
	@echo "  make setup               Install Python dependencies"
	@echo "  make check               Validate fixtures and compile Python files"
	@echo "  make eval                Run the full benchmark"
	@echo "  make eval-fast           Run the first 3 benchmark cases"
	@echo "  make run QUERY=\"...\"     Run one shopper request"
	@echo "  make web                 Start the local trace/review UI"

doctor:
	$(PYTHON) scripts/doctor.py

setup:
	$(PYTHON) -m pip install -r requirements.txt

check:
	$(PYTHON) -m py_compile src/agent.py src/tools.py src/run_agent.py src/web.py eval/evaluate.py scripts/doctor.py
	$(PYTHON) eval/evaluate.py --validate-fixture

eval:
	$(PYTHON) eval/evaluate.py

eval-fast:
	$(PYTHON) eval/evaluate.py --limit 3

run:
	$(PYTHON) src/run_agent.py "$(QUERY)"

web:
	$(PYTHON) src/web.py
