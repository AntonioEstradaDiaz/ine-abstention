"""Back up and verify the FastAPI PostgreSQL database (NOT Supabase Auth).

Usage:
 PULSO_BACKUP_DATABASE_URL=postgresql://... python scripts/ops_backup.py backup --directory /encrypted/backups
 python scripts/ops_backup.py verify --archive /encrypted/backups/pulso-....dump
 PULSO_RESTORE_DATABASE_URL=postgresql://... PULSO_RESTORE_ALLOWED=YES \
   python scripts/ops_backup.py restore --archive ... --confirm-restore

The archive must be copied to encrypted off-host storage by the operator.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from tempfile import mkstemp
from urllib.parse import unquote, urlsplit


def connection(env_name: str) -> tuple[list[str], dict[str, str], str]:
    raw = os.environ.get(env_name, "")
    value = raw.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlsplit(value)
    if parsed.scheme != "postgresql" or not parsed.hostname or not parsed.path.strip("/"):
        raise ValueError(f"{env_name} must be a PostgreSQL connection URL")
    db_name = unquote(parsed.path.removeprefix("/"))
    if "/" in db_name or not db_name:
        raise ValueError("Invalid database name")
    env = os.environ.copy()
    env["PGPASSWORD"] = unquote(parsed.password or "")
    if not env["PGPASSWORD"]:
        raise ValueError(f"{env_name} requires a password")
    opts = ["-h", parsed.hostname, "-p", str(parsed.port or 5432), "-U", unquote(parsed.username or "")]
    if not parsed.username:
        raise ValueError(f"{env_name} requires a username")
    # Security: credentials never appear in the argument list, file name or manifest.
    if parsed.query:
        from urllib.parse import parse_qs

        params = parse_qs(parsed.query)
        ssl = params.get("sslmode", [None])[0]
        if ssl:
            if ssl not in {"require", "verify-ca", "verify-full", "prefer", "disable"}:
                raise ValueError("Invalid sslmode")
            env["PGSSLMODE"] = ssl
    return opts + ["-d", db_name], env, db_name


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def manifest_path(archive: Path) -> Path:
    return Path(str(archive) + ".json")


def backup(directory: Path) -> Path:
    args, env, db = connection("PULSO_BACKUP_DATABASE_URL")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink():
        raise ValueError("Backup directory must not be a symbolic link")
    os.chmod(directory, 0o700)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    archive = directory / f"pulso-{stamp}-{os.urandom(4).hex()}.dump"
    fd, temp_name = mkstemp(prefix=".pulso-", suffix=".partial", dir=directory)
    os.close(fd)
    temp = Path(temp_name)
    try:
        subprocess.run(
            ["pg_dump", "--format=custom", "--no-owner", "--no-acl",
             "--file", str(temp), *args],
            env=env, check=True, timeout=900,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if not temp.stat().st_size:
            raise ValueError("Empty backup archive")
        os.replace(temp, archive)
        os.chmod(archive, 0o600)
        record = {
            "format": "pg_dump_custom",
            "created_utc": datetime.now(UTC).isoformat(),
            "database": db,
            "sha256": digest(archive),
            "size": archive.stat().st_size,
        }
        metadata = manifest_path(archive)
        metadata.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        os.chmod(metadata, 0o600)
    finally:
        temp.unlink(missing_ok=True)
    print(f"Backup and manifest created: {archive.name}")
    return archive


def verify(archive: Path) -> dict:
    if archive.is_symlink():
        raise ValueError("Archive must not be a symbolic link")
    archive = archive.resolve(strict=True)
    meta = manifest_path(archive)
    record = json.loads(meta.read_text(encoding="utf-8"))
    if record.get("format") != "pg_dump_custom":
        raise ValueError("Unsupported archive format")
    if record.get("size") != archive.stat().st_size or record.get("sha256") != digest(archive):
        raise ValueError("Backup integrity check failed")
    subprocess.run(
        ["pg_restore", "--list", str(archive)], check=True, timeout=60,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print("Backup SHA-256 and pg_restore catalog verified")
    return record


def restore(archive: Path, confirm: bool) -> None:
    if not confirm or os.environ.get("PULSO_RESTORE_ALLOWED") != "YES":
        raise ValueError("Restore requires --confirm-restore and PULSO_RESTORE_ALLOWED=YES")
    record = verify(archive)
    args, env, target = connection("PULSO_RESTORE_DATABASE_URL")
    if target == record.get("database"):
        raise ValueError("Restore target must be a separate database for a safe recovery drill")
    subprocess.run(
        ["pg_restore", "--exit-on-error", "--single-transaction",
         "--no-owner", "--no-acl", *args, str(archive.resolve())],
        check=True, env=env, timeout=900,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    print("Restored to the isolated target; inspect counts and application invariants")


def main() -> None:
    parser = argparse.ArgumentParser(description="PULSO PostgreSQL backup/verification/drill")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("backup")
    create.add_argument("--directory", required=True, type=Path)
    check = commands.add_parser("verify")
    check.add_argument("--archive", required=True, type=Path)
    restore_cmd = commands.add_parser("restore")
    restore_cmd.add_argument("--archive", required=True, type=Path)
    restore_cmd.add_argument("--confirm-restore", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "backup":
            backup(args.directory)
        elif args.command == "verify":
            verify(args.archive)
        else:
            restore(args.archive, args.confirm_restore)
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        # Do not include DB URL, command arguments or stderr in error reports.
        print(f"Operational backup command failed ({type(exc).__name__}).", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
