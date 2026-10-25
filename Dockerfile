# --- 1. build the React frontend ---------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ARG VITE_REPO_URL=""
ENV VITE_REPO_URL=${VITE_REPO_URL}
RUN npm run build

# --- 2. Python API that also serves the built frontend ------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY src/ src/
COPY data/synthetic/ data/synthetic/
COPY --from=web /web/dist frontend/dist
RUN useradd --create-home app && mkdir -p data/runtime && chown -R app:app data/runtime
USER app
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/health')"
# One worker on purpose: rate limits and the spend counter are per-process.
CMD ["sh", "-c", "uvicorn src.api:app --host 0.0.0.0 --port ${PORT} --workers 1"]
