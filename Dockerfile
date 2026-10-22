FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy PATH="/srv/.venv/bin:$PATH"
RUN pip install --no-cache-dir uv==0.11.15
COPY pyproject.toml uv.lock ./
COPY app ./app
COPY pipelines ./pipelines
RUN uv sync --locked --no-dev --no-editable && useradd --create-home backend
COPY alembic.ini ./
COPY alembic ./alembic
COPY scripts ./scripts
USER backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
