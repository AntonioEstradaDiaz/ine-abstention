"""Cargar en Supabase los agregados validados, en una transacción por elección."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipelines.ingestion.load import load  # noqa: E402
from pipelines.transformation.ccpc import DATES  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("years", nargs="*", type=int, choices=sorted(DATES))
    args = parser.parse_args()
    for year in args.years or sorted(DATES):
        print(json.dumps(load(ROOT, year)), flush=True)
