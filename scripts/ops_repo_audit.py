"""Verify that local environment and secret-bearing filenames are not tracked."""
import subprocess
from pathlib import PurePosixPath


def check(paths: list[str]) -> list[str]:
    violations = []
    for raw in paths:
        path = PurePosixPath(raw)
        name = path.name.lower()
        if name in {
            ".env", ".env.local", ".env.production", ".env.development",
            "id_rsa", "id_ed25519", "credentials.json",
        } or (path.suffix.lower() in {".pem", ".p12", ".pfx", ".key"}):
            violations.append(raw)
    return violations


def main() -> int:
    raw = subprocess.check_output(["git", "ls-files", "-z"])
    paths = [part.decode("utf-8") for part in raw.split(b"\x00") if part]
    findings = check(paths)
    if findings:
        print("Tracked secret-like files:", ", ".join(findings))
        return 1
    print(f"Tracked file hygiene OK ({len(paths)} files). Review secret manager separately.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
