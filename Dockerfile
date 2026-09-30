# Python image shared by the backend API and the mock Cognito service.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# CPU-only torch first (keeps the image ~1 GB smaller than the default CUDA build).
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu
COPY pyproject.toml ./
COPY src/ai_models src/ai_models
COPY src/database src/database
COPY src/aws src/aws
COPY src/backend src/backend
RUN pip install -e .
COPY dataset/scripts dataset/scripts
COPY dataset/*.md dataset/
COPY results/*.md results/

ENV CAPPLAN_DATASET_DIR=/app/dataset CAPPLAN_RESULTS_DIR=/app/results CAPPLAN_ARTIFACTS_DIR=/app/results/artifacts
EXPOSE 8000 9229
CMD ["uvicorn", "capplan_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
