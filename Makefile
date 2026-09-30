# Predictive capacity planning — local, simulated AWS.
PY := .venv/bin
UNAME := $(shell uname)
ifeq ($(UNAME),Darwin)
  # xgboost needs libomp; reuse torch's copy instead of a system install.
  export DYLD_LIBRARY_PATH := $(CURDIR)/.venv/lib/python3.12/site-packages/torch/lib
endif

.PHONY: install data kaggle backtest test dev up down clean

install:            ## Python venv + frontend deps
	python3 -m venv .venv
	$(PY)/pip install -q --upgrade pip
	$(PY)/pip install -q torch --index-url https://download.pytorch.org/whl/cpu
	$(PY)/pip install -q -e ".[dev]"
	cd src/frontend && npm install

data:               ## generate + preprocess the bundled synthetic trace
	$(PY)/python dataset/scripts/generate_synthetic.py

kaggle:             ## optional: drive the demand shape from a Kaggle series (falls back to synthetic)
	$(PY)/pip install -q kaggle && $(PY)/python dataset/scripts/load_kaggle.py

backtest:           ## fit all models, backtest, simulate scaling policies → results/
	$(PY)/python -m capplan_ml.pipeline backtest

test:
	$(PY)/pytest

dev:                ## run everything without Docker (SQLite + moto_server)
	./scripts/dev.sh

up:                 ## full stack in Docker (Postgres + moto container)
	docker compose up --build

down:
	docker compose down

clean:
	rm -rf dataset/raw/*.parquet dataset/raw/*.csv dataset/raw/*.json dataset/processed/*.parquet dataset/processed/*.json results/artifacts capplan-dev.db*
