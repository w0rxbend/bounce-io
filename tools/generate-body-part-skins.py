#!/usr/bin/env python3
"""Generate the built-in modular body-part skin assets and per-skin metadata.

Custom skins can be added without changing this generator: create a directory
under assets/cosmetics/skins and run tools/build-cosmetics-manifest.py.
"""
from __future__ import annotations

import colorsys
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/client/public/assets/cosmetics"
SKINS = ["amber", "crimson", "teal", "violet", "forest", "slate", "ivory", "coal"] + [f"s{i:02d}" for i in range(8, 50)]
LEGACY = {
    "amber": "ffd090", "crimson": "b83020", "teal": "30c8c0", "violet": "9b6dff",
    "forest": "4f6f3f", "slate": "36475f", "ivory": "f4e8c8", "coal": "1c1f2a",
}


def rgb(hex_color: str) -> tuple[int, int, int, int]:
    return (*bytes.fromhex(hex_color), 255)


def palette(skin_id: str, index: int) -> tuple[tuple[int, int, int, int], ...]:
    if skin_id in LEGACY:
        base = rgb(LEGACY[skin_id])
    else:
        r, g, b = colorsys.hls_to_rgb(((index * 137.508 + 18) % 360) / 360, 0.42 + index % 3 * .07, .48 + index % 4 * .08)
        base = (round(r * 255), round(g * 255), round(b * 255), 255)
    dark = tuple(max(0, round(c * .48)) for c in base[:3]) + (255,)
    shade = tuple(max(0, round(c * .72)) for c in base[:3]) + (255,)
    light = tuple(min(255, round(c + (255 - c) * .42)) for c in base[:3]) + (255,)
    return base, dark, shade, light


class PixelImage:
    def __init__(self, width: int, height: int) -> None:
        self.width, self.height = width, height
        self.pixels = bytearray(width * height * 4)

    def point(self, xy: tuple[int, int], fill: tuple[int, int, int, int]) -> None:
        x, y = xy
        if 0 <= x < self.width and 0 <= y < self.height:
            offset = (y * self.width + x) * 4
            self.pixels[offset:offset + 4] = bytes(fill)

    def rectangle(self, bounds: tuple[int, int, int, int], fill: tuple[int, int, int, int]) -> None:
        x0, y0, x1, y1 = bounds
        for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1): self.point((x, y), fill)

    def rows(self, spans: list[tuple[int, int, int]], fill: tuple[int, int, int, int]) -> None:
        """Fill explicit horizontal runs—the basic primitive for rounded pixel silhouettes."""
        for y, x0, x1 in spans:
            self.rectangle((x0, y, x1, y), fill)

    def polygon(self, points: list[tuple[int, int]], fill: tuple[int, int, int, int]) -> None:
        min_x, max_x = min(p[0] for p in points), max(p[0] for p in points)
        min_y, max_y = min(p[1] for p in points), max(p[1] for p in points)
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                inside = False
                j = len(points) - 1
                for i, (xi, yi) in enumerate(points):
                    xj, yj = points[j]
                    if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: inside = not inside
                    j = i
                if inside: self.point((x, y), fill)

    def resize_nearest(self, width: int, height: int) -> "PixelImage":
        """Scale authored pixel art without introducing blurred alpha edges."""
        scaled = PixelImage(width, height)
        for y in range(height):
            source_y = min(self.height - 1, y * self.height // height)
            for x in range(width):
                source_x = min(self.width - 1, x * self.width // width)
                source = (source_y * self.width + source_x) * 4
                target = (y * width + x) * 4
                scaled.pixels[target:target + 4] = self.pixels[source:source + 4]
        return scaled

    def save(self, path: Path, optimize: bool = True) -> None:
        def chunk(kind: bytes, data: bytes) -> bytes:
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
        rows = b"".join(b"\x00" + self.pixels[y * self.width * 4:(y + 1) * self.width * 4] for y in range(self.height))
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", self.width, self.height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
        path.write_bytes(png)


def blank(w: int, h: int) -> tuple[PixelImage, PixelImage]:
    image = PixelImage(w, h)
    return image, image


def draw_part(part: str, colors: tuple[tuple[int, int, int, int], ...], variant: int) -> PixelImage:
    base, dark, shade, light = colors
    if part == "head":
        # Deliberately oversized versus the 10 px torso: the game's identity is
        # a toy-like big-head silhouette that remains readable at camera scale.
        image, d = blank(22, 20)
        d.rows([(1, 8, 13), (2, 5, 16), (3, 3, 18), (4, 2, 19),
                (5, 1, 20), (6, 1, 20), (7, 0, 21), (8, 0, 21),
                (9, 0, 21), (10, 0, 21), (11, 0, 21), (12, 0, 21),
                (13, 0, 21), (14, 1, 20), (15, 1, 20), (16, 2, 19),
                (17, 3, 18), (18, 5, 16), (19, 8, 13)], dark)
        d.rows([(3, 7, 14), (4, 5, 16), (5, 4, 17), (6, 3, 18),
                (7, 2, 19), (8, 2, 19), (9, 2, 19), (10, 2, 19),
                (11, 2, 19), (12, 2, 19), (13, 2, 19), (14, 3, 18),
                (15, 3, 18), (16, 5, 16), (17, 7, 14)], base)
        d.rows([(4, 7, 13), (5, 5, 9), (6, 4, 7), (7, 3, 5)], light)
        d.rows([(13, 15, 19), (14, 13, 18), (15, 10, 17), (16, 9, 15), (17, 10, 13)], shade)
        d.rectangle((6, 10, 7, 11), light); d.rectangle((14, 10, 15, 11), light)
        if variant % 4 == 0:
            d.rows([(2, 8, 13), (3, 7, 14)], light)
        elif variant % 4 == 1:
            d.point((3, 9), light); d.point((18, 12), shade)
        elif variant % 4 == 2:
            d.rows([(5, 15, 17), (6, 16, 18)], shade)
        else:
            d.rows([(3, 10, 11), (4, 9, 12)], light)
        image = image.resize_nearest(28, 32)
    elif part == "torso":
        image, d = blank(10, 14)
        d.rows([(0, 3, 6), (1, 1, 8), (2, 0, 9), (3, 0, 9),
                (4, 1, 8), (5, 1, 8), (6, 1, 8), (7, 1, 8),
                (8, 2, 7), (9, 2, 7), (10, 2, 7), (11, 2, 7),
                (12, 3, 6), (13, 4, 5)], dark)
        d.rows([(2, 2, 7), (3, 1, 8), (4, 2, 7), (5, 2, 7),
                (6, 2, 7), (7, 2, 7), (8, 3, 6), (9, 3, 6),
                (10, 3, 6), (11, 3, 6)], base)
        d.rows([(2, 3, 6), (3, 2, 4), (4, 2, 3)], light)
        d.rows([(8, 6, 7), (9, 5, 6), (10, 4, 6), (11, 4, 5)], shade)
        if variant % 3 == 0: d.rows([(6, 2, 7), (7, 3, 6)], shade)
        elif variant % 3 == 1: d.point((7, 5), light); d.point((2, 9), shade)
        else: d.rows([(4, 6, 7), (5, 7, 7)], light)
    elif part == "chest":
        image, d = blank(10, 8)
        d.rows([(0, 2, 7), (1, 0, 9), (2, 0, 9), (3, 0, 9),
                (4, 1, 8), (5, 1, 8), (6, 2, 7), (7, 3, 6)], dark)
        d.rows([(1, 2, 7), (2, 1, 8), (3, 1, 8), (4, 2, 7),
                (5, 2, 7), (6, 3, 6)], base)
        d.rows([(1, 3, 6), (2, 2, 4)], light)
        d.rows([(4, 7, 7), (5, 5, 7), (6, 5, 6)], shade)
        if variant % 2: d.point((2, 4), light); d.point((7, 3), shade)
    elif part == "neck":
        image, d = blank(6, 4)
        d.rows([(0, 1, 4), (1, 0, 5), (2, 0, 5), (3, 1, 4)], dark)
        d.rows([(1, 1, 4), (2, 1, 4)], base)
        d.point((1, 1), light); d.point((4, 2), shade)
    elif part == "arm":
        image, d = blank(6, 10)
        d.rows([(0, 1, 4), (1, 0, 5), (2, 0, 5), (3, 1, 4),
                (4, 1, 4), (5, 1, 4), (6, 1, 4), (7, 0, 5),
                (8, 0, 5), (9, 1, 4)], dark)
        d.rows([(1, 1, 4), (2, 1, 4), (3, 2, 3), (4, 2, 3),
                (5, 2, 3), (6, 2, 3), (7, 1, 4), (8, 1, 4)], base)
        d.rows([(1, 1, 2), (2, 1, 2), (3, 2, 2)], light)
        d.rows([(6, 3, 3), (7, 3, 4), (8, 2, 4)], shade)
        if variant % 2: d.point((4, 4), light); d.point((1, 6), shade)
    elif part == "hand":
        image, d = blank(6, 5)
        d.rows([(0, 1, 4), (1, 0, 5), (2, 0, 5), (3, 0, 5), (4, 1, 4)], dark)
        d.rows([(1, 1, 4), (2, 1, 4), (3, 1, 4)], base)
        d.point((1, 1), light); d.point((4, 3), shade)
        if variant % 3 == 0: d.point((2, 2), light)
    elif part == "leg":
        image, d = blank(8, 10)
        d.rows([(0, 2, 5), (1, 1, 6), (2, 1, 6), (3, 1, 6),
                (4, 1, 6), (5, 2, 6), (6, 2, 6), (7, 1, 6),
                (8, 1, 6), (9, 2, 5)], dark)
        d.rows([(1, 2, 5), (2, 2, 5), (3, 2, 5), (4, 2, 5),
                (5, 3, 5), (6, 3, 5), (7, 2, 5), (8, 2, 5)], base)
        d.rows([(1, 2, 3), (2, 2, 3), (3, 2, 2)], light)
        d.rows([(6, 5, 5), (7, 4, 5), (8, 3, 5)], shade)
        if variant % 2: d.point((6, 3), light); d.point((2, 6), shade)
    elif part == "foot":
        image, d = blank(8, 5)
        d.rows([(0, 1, 5), (1, 0, 7), (2, 0, 7), (3, 0, 6), (4, 1, 5)], dark)
        d.rows([(1, 1, 6), (2, 1, 6), (3, 1, 5)], base)
        d.rows([(1, 2, 4), (2, 1, 2)], light)
        d.rows([(2, 6, 6), (3, 4, 5)], shade)
        if variant % 3 == 1: d.point((5, 1), light)
    else:
        raise ValueError(f"unknown body part: {part}")
    return image


def main() -> None:
    for index, skin_id in enumerate(SKINS):
        folder = OUT / "skins" / skin_id
        folder.mkdir(parents=True, exist_ok=True)
        for part in ("head", "torso", "chest", "neck", "arm", "hand", "leg", "foot"):
            image = draw_part(part, palette(skin_id, index), index)
            path = folder / f"{part}.png"
            image.save(path, optimize=True)
        metadata = {
            "schemaVersion": 1,
            "id": skin_id,
            "displayName": skin_id.title() if index < 8 else f"Relic {index + 1:02d}",
            "tags": ["built-in", ["earth", "frost", "arcane", "ember", "storm"][index % 5]],
            "fallbackColor": f"#{''.join(f'{channel:02x}' for channel in palette(skin_id, index)[0][:3])}",
        }
        (folder / "skin.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"generated {len(SKINS)} built-in skins / {len(SKINS) * 8} PNG part assets")


if __name__ == "__main__":
    main()
