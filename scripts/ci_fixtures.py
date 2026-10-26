"""Empaquetar y restaurar los agregados y modelos congelados usados por CI."""

import argparse
import gzip
import hashlib
import json
import shutil
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "tests/fixtures/ci.tar.gz"


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def pack() -> None:
    report = json.loads((ROOT / "docs/phase4_metrics.json").read_text(encoding="utf-8"))
    model_dir = ROOT / "artifacts/models" / report["run_id"]
    files = [ROOT / "data/demo/manifest.json", ROOT / "data/demo/snapshot.jsonl.gz"]
    files.extend(p for p in model_dir.iterdir() if p.is_file())
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    with ARCHIVE.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                for path in sorted(files):
                    info = tarfile.TarInfo(path.relative_to(ROOT).as_posix())
                    info.size = path.stat().st_size
                    info.mode = 0o644
                    with path.open("rb") as source:
                        archive.addfile(info, source)
    ARCHIVE.with_suffix(".gz.sha256").write_text(sha256(ARCHIVE) + "\n", encoding="ascii")
    print(f"Packed {len(files)} files ({ARCHIVE.stat().st_size} bytes)")


def restore(root: Path) -> None:
    expected = ARCHIVE.with_suffix(".gz.sha256").read_text(encoding="ascii").strip()
    if sha256(ARCHIVE) != expected:
        raise ValueError("El paquete CI no coincide con su SHA-256")
    root = root.resolve()
    allowed = (root / "data/demo", root / "artifacts/models")
    with tarfile.open(ARCHIVE, "r:gz") as archive:
        for member in archive.getmembers():
            target = (root / member.name).resolve()
            if (
                not member.isfile()
                or not member.name.startswith(("data/demo/", "artifacts/models/"))
                or not target.is_relative_to(root)
                or not any(target.is_relative_to(directory) for directory in allowed)
            ):
                raise ValueError("Ruta o tipo de archivo no permitido en el paquete CI")
            source = archive.extractfile(member)
            assert source is not None
            with source:
                if target.exists():
                    if sha256(target) != hashlib.file_digest(source, "sha256").hexdigest():
                        raise ValueError(f"No se sobrescribe un archivo distinto: {member.name}")
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("wb") as destination:
                    shutil.copyfileobj(source, destination)
    print("CI fixtures restored and existing files preserved")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("pack", "restore"))
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    if args.mode == "pack":
        pack()
    else:
        restore(args.root)
