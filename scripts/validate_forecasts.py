"""Generate or check the frozen external-accuracy limitations and NS sensitivity audit."""
import argparse
import json
from pathlib import Path

from app.ml.validation_audit import read_audit

ROOT = Path(__file__).resolve().parents[1]
TARGETS = (
    ROOT / "docs/punto6_validacion.json",
    ROOT / "frontend/src/lib/forecast-validation.json",
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Fail if committed snapshots differ")
    args = parser.parse_args()
    result = read_audit(ROOT)
    expected = json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if args.check:
        for path in TARGETS:
            if not path.exists() or path.read_text(encoding="utf-8") != expected:
                raise SystemExit(f"Snapshot outdated: {path.relative_to(ROOT)}")
        print("Forecast audit: both snapshots match the frozen out-of-time data")
        return 0
    for path in TARGETS:
        path.parent.mkdir(exist_ok=True, parents=True)
        path.write_text(expected, encoding="utf-8")
        print(f"Regenerated {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
