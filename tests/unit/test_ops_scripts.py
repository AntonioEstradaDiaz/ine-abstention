"""Offline safety checks; never run a destructive operation or send a real alert."""
import importlib.util
import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest


def load(name):
    path = Path(__file__).resolve().parents[2] / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_backup_requires_explicit_secret(monkeypatch):
    backup = load("ops_backup")
    monkeypatch.delenv("PULSO_BACKUP_DATABASE_URL", raising=False)
    with pytest.raises(ValueError, match="PostgreSQL"):
        backup.connection("PULSO_BACKUP_DATABASE_URL")


def test_pg_connection_separates_password_from_arguments(monkeypatch):
    backup = load("ops_backup")
    monkeypatch.setenv(
        "PULSO_BACKUP_DATABASE_URL",
        "postgresql+psycopg://operator:a%21bc@db.example.com:5432/pulso?sslmode=require",
    )
    args, env, db = backup.connection("PULSO_BACKUP_DATABASE_URL")
    assert db == "pulso"
    assert env["PGPASSWORD"] == "a!bc"
    assert "a!bc" not in " ".join(args)
    assert env["PGSSLMODE"] == "require"


def test_backup_verify_detects_modified_archive(tmp_path):
    backup = load("ops_backup")
    archive = tmp_path / "backup.dump"
    archive.write_bytes(b"dummy")
    backup.manifest_path(archive).write_text(
        json.dumps({
            "format": "pg_dump_custom",
            "size": 5,
            "sha256": backup.digest(archive),
            "database": "main",
        }), encoding="utf-8",
    )
    with patch.object(backup.subprocess, "run"):
        assert backup.verify(archive)["database"] == "main"
    archive.write_bytes(b"MODIFIED")
    with pytest.raises(ValueError, match="integrity"):
        backup.verify(archive)


def test_restore_guard_blocks_unsafe_execution(tmp_path, monkeypatch):
    backup = load("ops_backup")
    monkeypatch.delenv("PULSO_RESTORE_ALLOWED", raising=False)
    with pytest.raises(ValueError, match="requires"):
        backup.restore(tmp_path / "does-not-exist", True)


def test_monitor_rejects_insecure_external_url():
    monitor = load("ops_healthcheck")
    with pytest.raises(ValueError, match="HTTPS"):
        monitor.probe("http://public.example.invalid/api/v1/health/ready")


def test_monitor_rejects_missing_readiness_route():
    monitor = load("ops_healthcheck")
    with pytest.raises(ValueError, match="readiness"):
        monitor.probe("https://public.example.invalid/api/v1/health")


def test_concurrency_bounds():
    loadtest = load("ops_loadcheck")
    with pytest.raises(ValueError, match="1–300"):
        loadtest.run("http://127.0.0.1:8001/api/v1/health", 1000, 2)
    with pytest.raises(ValueError, match="HTTPS"):
        loadtest.run("http://public.example.invalid/api/v1/health", 2, 2)
