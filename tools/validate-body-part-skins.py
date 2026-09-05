#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/client/public/assets"
MANIFEST = ASSETS / "cosmetics/manifest.json"
PARTS = {"head", "torso", "chest", "neck", "arm", "hand", "leg", "foot"}

def require(condition: bool, message: object) -> None:
    if not condition:
        raise ValueError(str(message))

def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    require(data.get("schemaVersion") == 2, "manifest schemaVersion must be 2")
    require(data.get("skinCount", 0) >= 50, "catalog must contain at least 50 skins")
    ids: set[str] = set()
    for skin in data["skins"]:
        require(skin["id"] not in ids, f"duplicate skin id: {skin['id']}")
        ids.add(skin["id"])
        require(set(skin["parts"]) == PARTS, f"incomplete parts for {skin['id']}")
        for part, meta in skin["parts"].items():
            path = ASSETS / meta["png"].removeprefix("/assets/")
            require(path.is_file(), path)
            raw = path.read_bytes()
            require(raw.startswith(b"\x89PNG\r\n\x1a\n"), f"invalid PNG signature: {path}")
            width, height, depth, color = struct.unpack(">IIBB", raw[16:26])
            require((width, height, depth, color) == (meta["width"], meta["height"], 8, 6), f"PNG metadata mismatch: {path}")
            pivot = meta.get("pivot")
            require(isinstance(pivot, list) and len(pivot) == 2, f"invalid pivot for {skin['id']}/{part}")
            require(all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in pivot),
                    f"non-finite pivot for {skin['id']}/{part}")
            require(0 <= pivot[0] <= width and 0 <= pivot[1] <= height, f"pivot outside PNG for {skin['id']}/{part}: {pivot}")
            offset, compressed = 8, b""
            while offset < len(raw):
                length = struct.unpack(">I", raw[offset:offset + 4])[0]
                kind = raw[offset + 4:offset + 8]
                if kind == b"IDAT": compressed += raw[offset + 8:offset + 8 + length]
                offset += 12 + length
            pixels = zlib.decompress(compressed)
            alpha_rows = [[pixels[y * (width * 4 + 1) + 1 + x * 4 + 3] for x in range(width)] for y in range(height)]
            alpha_values = {alpha for row in alpha_rows for alpha in row}
            require(alpha_values <= {0, 255} and alpha_values == {0, 255}, f"PNG must use crisp binary transparency: {path}")
            require(all(alpha_rows[y][x] == 0 for x, y in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))),
                    f"PNG must keep all corners transparent for a rounded silhouette: {path}")
            row_widths = [sum(alpha == 255 for alpha in row) for row in alpha_rows if any(alpha == 255 for alpha in row)]
            require(len(set(row_widths)) >= 2 and row_widths[0] < max(row_widths) and row_widths[-1] < max(row_widths),
                    f"PNG silhouette must use stepped rounded caps: {path}")
    require(len(ids) == data["skinCount"], "skinCount does not match records")
    print(f"validated {len(ids)} complete skins and {len(ids) * 8} transparent PNGs")

if __name__ == "__main__":
    main()
