"""Validar ZIP locales y preparar agregados; este comando no modifica Supabase."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipelines.transformation.ccpc import DATES, prepare  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("years", nargs="*", type=int, choices=sorted(DATES))
    args = parser.parse_args()
    for year in args.years or sorted(DATES):
        report = prepare(ROOT, year)
        print(
            json.dumps(
                {
                    k: report[k]
                    for k in (
                        "year",
                        "status",
                        "raw_rows",
                        "territories",
                        "demographic_rows",
                        "totals",
                    )
                }
            ),
            flush=True,
        )
