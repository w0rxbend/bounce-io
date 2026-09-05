#!/usr/bin/env python3
"""Discover modular skin folders and build the browser-safe aggregate manifest."""
from __future__ import annotations

import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/client/public/assets/cosmetics"
SKINS = OUT / "skins"
PARTS = ("head", "torso", "chest", "neck", "arm", "hand", "leg", "foot")
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,9}$")


def png_size(path: Path) -> tuple[int, int]:
    raw = path.read_bytes()
    if len(raw) < 33 or not raw.startswith(b"\x89PNG\r\n\x1a\n") or raw[12:16] != b"IHDR":
        raise ValueError(f"not a valid PNG: {path}")
    return struct.unpack(">II", raw[16:24])


def load_metadata(folder: Path) -> dict[str, object]:
    metadata_path = folder / "skin.json"
    if not metadata_path.is_file():
        raise ValueError(f"missing {metadata_path.relative_to(ROOT)}")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("schemaVersion") != 1:
        raise ValueError(f"unsupported skin metadata schema in {metadata_path.relative_to(ROOT)}")
    if metadata.get("id") != folder.name or not ID_PATTERN.fullmatch(folder.name):
        raise ValueError(f"skin id must match its wire-safe folder name: {folder.name!r}")
    display_name = metadata.get("displayName")
    tags = metadata.get("tags", [])
    fallback = metadata.get("fallbackColor")
    pivots = metadata.get("pivots", {})
    if not isinstance(display_name, str) or not display_name.strip() or len(display_name) > 40:
        raise ValueError(f"invalid displayName for {folder.name}")
    if not isinstance(tags, list) or any(not isinstance(tag, str) or len(tag) > 24 for tag in tags):
        raise ValueError(f"invalid tags for {folder.name}")
    if not isinstance(fallback, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", fallback):
        raise ValueError(f"invalid fallbackColor for {folder.name}")
    if not isinstance(pivots, dict) or any(part not in PARTS for part in pivots):
        raise ValueError(f"invalid pivot part names for {folder.name}")
    return metadata


def main() -> None:
    records: list[dict[str, object]] = []
    folders = sorted((path for path in SKINS.iterdir() if path.is_dir()), key=lambda path: path.name)
    folded: set[str] = set()
    for folder in folders:
        metadata = load_metadata(folder)
        if folder.name.casefold() in folded:
            raise ValueError(f"case-insensitive duplicate skin id: {folder.name}")
        folded.add(folder.name.casefold())
        parts: dict[str, object] = {}
        for part in PARTS:
            path = folder / f"{part}.png"
            if not path.is_file():
                raise ValueError(f"missing {path.relative_to(ROOT)}")
            width, height = png_size(path)
            default_pivot = [0, height / 2] if part == "foot" else [width / 2, 0 if part in {"arm", "hand", "leg"} else height]
            pivot = metadata.get("pivots", {}).get(part, default_pivot)
            if (not isinstance(pivot, list) or len(pivot) != 2 or
                    any(not isinstance(value, (int, float)) or isinstance(value, bool) for value in pivot) or
                    not 0 <= pivot[0] <= width or not 0 <= pivot[1] <= height):
                raise ValueError(f"invalid {part} pivot for {folder.name}: {pivot!r}")
            parts[part] = {
                "png": f"/assets/cosmetics/skins/{folder.name}/{part}.png",
                "width": width,
                "height": height,
                "pivot": pivot,
            }
        records.append({
            "id": folder.name,
            "displayName": metadata["displayName"],
            "tags": metadata.get("tags", []),
            "fallbackColor": metadata["fallbackColor"],
            "parts": parts,
        })
    manifest = {"schemaVersion": 2, "skinCount": len(records), "slots": ["head", "torso", "arms", "legs"], "skins": records}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"discovered {len(records)} skins / {len(records) * len(PARTS)} PNG part assets")


if __name__ == "__main__":
    main()
