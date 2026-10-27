FROM ghcr.io/astral-sh/uv:0.13.6 AS uv
FROM python:3.13-slim-bookworm

ARG WITH_AI=false
ARG OCI_SOURCE="https://github.com/saitatter/sticker-foundry"
ARG OCI_REVISION=""
ARG OCI_VERSION=""
LABEL org.opencontainers.image.source=$OCI_SOURCE \
      org.opencontainers.image.revision=$OCI_REVISION \
      org.opencontainers.image.version=$OCI_VERSION \
      org.opencontainers.image.title="Sticker Foundry API and workers"

COPY --from=uv /uv /uvx /usr/local/bin/
RUN apt-get update && apt-get install -y --no-install-recommends tini libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home foundry \
    && mkdir /data && chown foundry:foundry /data

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    U2NET_HOME=/data/rembg \
    OMP_NUM_THREADS=1
WORKDIR /app
COPY apps/backend/pyproject.toml apps/backend/uv.lock ./
RUN if [ "$WITH_AI" = "true" ]; then \
      uv sync --frozen --no-dev --extra ai --no-install-project; \
    else uv sync --frozen --no-dev --no-install-project; fi
COPY apps/backend/foundry ./foundry
RUN if [ "$WITH_AI" = "true" ]; then \
      uv sync --frozen --no-dev --extra ai --no-editable; \
    else uv sync --frozen --no-dev --no-editable; fi
USER foundry
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "python -m foundry.db_init && exec uvicorn foundry.main:app --host 0.0.0.0 --port 3000 --no-access-log"]
