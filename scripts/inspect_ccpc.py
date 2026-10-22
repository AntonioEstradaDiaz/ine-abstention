"""Descargar los ZIP enlazados por INE e inventariar su contenido sin extraerlos."""

import csv
import hashlib
import io
import json
import sys
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "pipelines/ingestion/sources.json"
RAW = ROOT / "data/raw/ccpc"
LIMIT = 128 * 1024 * 1024


def inspect(source: dict) -> dict:
    year = source["year"]
    directory = RAW / str(year)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "original.zip"
    metadata_path = directory / "download.json"
    if not path.exists():
        part = directory / "download.part"
        try:
            with (
                urllib.request.urlopen(source["url"], timeout=60) as response,
                part.open("wb") as f,
            ):
                size = 0
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > LIMIT:
                        raise ValueError("ZIP excede el límite de descarga")
                    f.write(chunk)
                metadata = {
                    "retrieved_at": datetime.now(UTC).isoformat(),
                    "last_modified": response.headers.get("Last-Modified"),
                    "content_type": response.headers.get("Content-Type"),
                    "resolved_url": response.url,
                }
            # Un archivo inválido no se marca como descarga terminada.
            with zipfile.ZipFile(part):
                pass
            part.replace(path)
            metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        finally:
            part.unlink(missing_ok=True)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    with path.open("rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    members = []
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            member = {"name": info.filename, "size": info.file_size}
            if info.filename.lower().endswith((".csv", ".txt")):
                with archive.open(info) as f:
                    sample = f.read(24_000)
                encoding = "utf-8-sig"
                try:
                    decoded = sample.decode(encoding)
                except UnicodeDecodeError:
                    encoding = "cp1252"
                    decoded = sample.decode(encoding)
                try:
                    dialect = csv.Sniffer().sniff(decoded[:8_000], delimiters=",;\t|")
                    rows = list(csv.reader(io.StringIO(decoded), dialect))[:4]
                    member.update(encoding=encoding, delimiter=dialect.delimiter, sample=rows)
                except csv.Error:
                    member.update(encoding=encoding, text_preview=decoded[:6_000])
            members.append(member)
    result = {
        **source,
        **metadata,
        "sha256": digest,
        "bytes": path.stat().st_size,
        "members": members,
    }
    (directory / "inventory.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"{year}: {len(members)} archivos, {path.stat().st_size:,} bytes", flush=True)
    return result


if __name__ == "__main__":
    sources = json.loads(CATALOG.read_text(encoding="utf-8"))["datasets"]
    years = {int(value) for value in sys.argv[1:]}
    if years:
        sources = [source for source in sources if source["year"] in years]
    with ThreadPoolExecutor(max_workers=3) as executor:
        list(executor.map(inspect, sources))
