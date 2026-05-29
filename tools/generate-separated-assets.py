from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "client" / "public" / "assets"
CHAR_ROOT = OUT / "playable_characters"
ENV_ROOT = OUT / "environment"
BACKGROUND_SOURCE = ROOT / "tools" / "assets" / "alpine_mountain_background.png"


PAL = {
    "ink": (22, 24, 35, 255),
    "outline": (12, 15, 24, 255),
    "shadow": (0, 0, 0, 86),
    "skin": (255, 208, 144, 255),
    "skin_shadow": (210, 138, 90, 255),
    "hair": (42, 26, 16, 255),
    "scarf": (184, 48, 32, 255),
    "scarf_dark": (112, 24, 24, 255),
    "gold": (248, 200, 48, 255),
    "gold_dark": (176, 112, 32, 255),
    "gold_light": (255, 232, 112, 255),
    "stone_deep": (40, 34, 26, 255),
    "stone_dark": (80, 64, 48, 255),
    "stone_mid": (144, 120, 88, 255),
    "stone_light": (200, 168, 120, 255),
    "stone_cool": (96, 104, 88, 255),
    "soil": (122, 80, 48, 255),
    "soil_dark": (64, 40, 24, 255),
    "grass": (144, 216, 56, 255),
    "grass_dark": (58, 120, 24, 255),
    "moss": (72, 144, 48, 255),
    "moss_light": (104, 192, 64, 255),
    "leaf_dark": (26, 56, 24, 255),
    "leaf_mid": (46, 104, 64, 255),
    "leaf_light": (106, 200, 64, 255),
    "bark": (106, 72, 32, 255),
    "bark_dark": (64, 40, 24, 255),
    "snow": (233, 242, 255, 255),
    "snow_shadow": (166, 196, 224, 255),
    "cyan": (64, 216, 248, 255),
    "cyan_light": (160, 240, 255, 255),
    "cyan_dark": (18, 72, 90, 255),
    "red": (232, 64, 48, 255),
    "orange": (255, 160, 96, 255),
    "pink": (208, 82, 158, 255),
    "violet": (154, 90, 255, 255),
    "blue": (64, 136, 216, 255),
    "green": (93, 255, 156, 255),
    "white": (255, 255, 240, 255),
    "cloud": (232, 240, 248, 220),
    "cloud_mid": (168, 192, 216, 210),
    "cloud_shadow": (104, 136, 184, 190),
}


def rgba(hex_rgb: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_rgb = hex_rgb.removeprefix("#")
    return (int(hex_rgb[0:2], 16), int(hex_rgb[2:4], 16), int(hex_rgb[4:6], 16), alpha)


def clean() -> None:
    for path in (CHAR_ROOT, ENV_ROOT):
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)


def canvas(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def save(img: Image.Image, rel: str, manifest: dict[str, dict]) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    manifest[rel] = {"png": f"/assets/{rel}", "width": img.width, "height": img.height}


def draw_shadow(d: ImageDraw.ImageDraw, x: int, y: int, w: int) -> None:
    d.ellipse((x, y, x + w, y + max(2, w // 5)), fill=PAL["shadow"])


def draw_character(kind: str, pose: str, frame: int, palette: dict[str, tuple[int, int, int, int]]) -> Image.Image:
    img = canvas(32, 48)
    d = ImageDraw.Draw(img)

    if pose == "lying_dead":
        draw_shadow(d, 7, 42, 20)
        d.rectangle((6, 31, 27, 40), fill=PAL["outline"])
        d.rectangle((8, 30, 25, 38), fill=palette["jacket"])
        d.rectangle((20, 24, 29, 33), fill=PAL["outline"])
        d.rectangle((21, 25, 28, 32), fill=palette["skin"])
        d.rectangle((21, 24, 29, 27), fill=palette["hair"])
        d.rectangle((9, 38, 14, 43), fill=palette["boots"])
        d.rectangle((20, 38, 25, 43), fill=palette["boots"])
        d.rectangle((12, 28, 22, 30), fill=palette["accent"])
        if frame % 2 == 0:
            d.rectangle((27, 27, 28, 28), fill=PAL["ink"])
        return img

    bob = 0
    if pose == "idle":
        bob = [0, -1, 0, 1][frame % 4]
    if pose in {"jumping", "shooting"}:
        bob = -3
    if pose == "falling":
        bob = 2

    lean = 0
    if pose == "running":
        lean = 2
    if pose == "shooting":
        lean = -1

    body_x = 11 + lean
    body_y = 18 + bob
    head_x = 10 + lean
    head_y = 9 + bob
    scarf_len = 7
    if pose == "running":
        scarf_len = 12 + (frame % 2) * 2
    if pose in {"jumping", "falling"}:
        scarf_len = 10
    if pose == "shooting":
        scarf_len = 14

    draw_shadow(d, 8, 43, 16)

    if kind == "mage":
        d.polygon([(9 + lean, head_y + 1), (16 + lean, head_y - 7), (24 + lean, head_y + 2)], fill=PAL["outline"])
        d.polygon([(11 + lean, head_y), (16 + lean, head_y - 6), (22 + lean, head_y + 1)], fill=palette["hat"])
        d.rectangle((13 + lean, head_y + 1, 23 + lean, head_y + 3), fill=palette["hat_band"])
    elif kind == "rogue":
        d.polygon([(8 + lean, head_y + 4), (16 + lean, head_y - 1), (24 + lean, head_y + 4), (22 + lean, head_y + 11), (10 + lean, head_y + 11)], fill=PAL["outline"])
        d.polygon([(10 + lean, head_y + 4), (16 + lean, head_y), (22 + lean, head_y + 4), (20 + lean, head_y + 10), (12 + lean, head_y + 10)], fill=palette["hood"])
    elif kind == "hunter":
        d.polygon([(9 + lean, head_y + 2), (16 + lean, head_y - 3), (23 + lean, head_y + 2), (23 + lean, head_y + 5), (9 + lean, head_y + 5)], fill=PAL["outline"])
        d.polygon([(11 + lean, head_y + 2), (16 + lean, head_y - 2), (21 + lean, head_y + 2), (21 + lean, head_y + 4), (11 + lean, head_y + 4)], fill=palette["hood"])
    else:
        d.rectangle((head_x - 1, head_y - 2, head_x + 13, head_y + 4), fill=PAL["outline"])
        d.rectangle((head_x, head_y - 2, head_x + 12, head_y + 2), fill=palette["hair"])

    d.rectangle((head_x - 1, head_y + 2, head_x + 13, head_y + 13), fill=PAL["outline"])
    d.rectangle((head_x, head_y + 3, head_x + 12, head_y + 12), fill=palette["skin"])
    if kind != "rogue":
        d.rectangle((head_x, head_y + 3, head_x + 12, head_y + 5), fill=palette["hair"])
    d.rectangle((head_x + 8, head_y + 7, head_x + 10, head_y + 9), fill=PAL["ink"])
    d.point((head_x + 10, head_y + 7), fill=PAL["white"])
    d.rectangle((head_x + 2, head_y + 12, head_x + 10, head_y + 14), fill=palette["skin_shadow"])

    d.rectangle((body_x - scarf_len, body_y + 5, body_x + 3, body_y + 7), fill=palette["scarf"])
    d.rectangle((body_x - scarf_len - 3, body_y + 8, body_x - 2, body_y + 9), fill=palette["scarf_dark"])

    d.rectangle((body_x - 2, body_y - 1, body_x + 14, body_y + 21), fill=PAL["outline"])
    d.rectangle((body_x, body_y, body_x + 12, body_y + 20), fill=palette["jacket_dark"])
    d.rectangle((body_x + 2, body_y + 2, body_x + 10, body_y + 17), fill=palette["jacket"])
    d.rectangle((body_x + 5, body_y + 1, body_x + 7, body_y + 18), fill=palette["belt"])
    d.rectangle((body_x + 2, body_y + 10, body_x + 10, body_y + 12), fill=palette["belt"])

    if pose in {"walking", "running"}:
        swing = [-3, -1, 2, 3, 1, -2][frame % 6]
    elif pose == "jumping":
        swing = -2
    elif pose == "falling":
        swing = 2
    else:
        swing = 0

    d.rectangle((body_x, body_y + 19 + max(0, swing), body_x + 4, body_y + 27 + max(0, swing)), fill=PAL["outline"])
    d.rectangle((body_x + 1, body_y + 19 + max(0, swing), body_x + 3, body_y + 26 + max(0, swing)), fill=palette["boots"])
    d.rectangle((body_x + 8, body_y + 19 + max(0, -swing), body_x + 12, body_y + 27 + max(0, -swing)), fill=PAL["outline"])
    d.rectangle((body_x + 9, body_y + 19 + max(0, -swing), body_x + 11, body_y + 26 + max(0, -swing)), fill=palette["boots"])

    arm_y = body_y + 6
    if pose == "shooting":
        d.rectangle((body_x + 12, arm_y, body_x + 24, arm_y + 4), fill=PAL["outline"])
        d.rectangle((body_x + 13, arm_y + 1, body_x + 23, arm_y + 3), fill=palette["skin"])
        if kind == "hunter":
            d.arc((body_x + 20, arm_y - 8, body_x + 30, arm_y + 12), 260, 95, fill=palette["weapon"], width=2)
            d.line((body_x + 25, arm_y - 6, body_x + 25, arm_y + 10), fill=PAL["gold_light"], width=1)
            d.rectangle((body_x + 27, arm_y + 1, body_x + 31, arm_y + 2), fill=PAL["gold_light"])
        elif kind == "mage":
            d.rectangle((body_x + 20, arm_y - 2, body_x + 22, arm_y + 12), fill=palette["weapon"])
            d.rectangle((body_x + 19, arm_y - 5, body_x + 23, arm_y - 1), fill=PAL["cyan"])
            d.rectangle((body_x + 24, arm_y - 4, body_x + 27, arm_y - 2), fill=PAL["cyan_light"])
        else:
            d.rectangle((body_x + 22, arm_y + 1, body_x + 31, arm_y + 2), fill=palette["weapon"])
            d.rectangle((body_x + 28, arm_y, body_x + 31, arm_y + 3), fill=PAL["cyan_light"])
    else:
        arm_swing = -swing if pose in {"walking", "running"} else 0
        d.rectangle((body_x - 5, arm_y + max(0, arm_swing), body_x + 1, arm_y + 4 + max(0, arm_swing)), fill=PAL["outline"])
        d.rectangle((body_x - 4, arm_y + 1 + max(0, arm_swing), body_x, arm_y + 3 + max(0, arm_swing)), fill=palette["skin"])
        d.rectangle((body_x + 11, arm_y + max(0, -arm_swing), body_x + 16, arm_y + 4 + max(0, -arm_swing)), fill=PAL["outline"])
        d.rectangle((body_x + 12, arm_y + 1 + max(0, -arm_swing), body_x + 15, arm_y + 3 + max(0, -arm_swing)), fill=palette["skin"])

    if pose == "kick":
        d.rectangle((body_x + 12, body_y + 20, body_x + 26, body_y + 25), fill=PAL["outline"])
        d.rectangle((body_x + 13, body_y + 21, body_x + 25, body_y + 24), fill=palette["jacket"])
        d.rectangle((body_x + 23, body_y + 20, body_x + 29, body_y + 25), fill=palette["boots"])

    return img


def character_palettes() -> dict[str, tuple[str, dict[str, tuple[int, int, int, int]]]]:
    return {
        "character1": ("warrior", {
            "jacket": rgba("#f3c64b"), "jacket_dark": rgba("#7b4a22"), "belt": rgba("#3a2418"),
            "hair": rgba("#3a2418"), "skin": PAL["skin"], "skin_shadow": PAL["skin_shadow"],
            "boots": rgba("#26351f"), "scarf": rgba("#b83020"), "scarf_dark": rgba("#701818"),
            "accent": PAL["gold_light"], "weapon": rgba("#d9e7f0"), "hood": rgba("#6a4820"),
            "hat": rgba("#f3c64b"), "hat_band": rgba("#7b4a22"),
        }),
        "character2": ("rogue", {
            "jacket": rgba("#31445f"), "jacket_dark": rgba("#182033"), "belt": rgba("#b07020"),
            "hair": rgba("#111827"), "skin": rgba("#f0b078"), "skin_shadow": rgba("#b66a4b"),
            "boots": rgba("#111827"), "scarf": rgba("#48d6ff"), "scarf_dark": rgba("#1a6f91"),
            "accent": rgba("#48d6ff"), "weapon": rgba("#d9e7f0"), "hood": rgba("#202a44"),
            "hat": rgba("#202a44"), "hat_band": rgba("#48d6ff"),
        }),
        "character3": ("mage", {
            "jacket": rgba("#4088d8"), "jacket_dark": rgba("#18305a"), "belt": rgba("#ffe870"),
            "hair": rgba("#201030"), "skin": rgba("#ffd0a0"), "skin_shadow": rgba("#c17c55"),
            "boots": rgba("#1c2540"), "scarf": rgba("#a050c8"), "scarf_dark": rgba("#502060"),
            "accent": PAL["cyan_light"], "weapon": rgba("#8a5a30"), "hood": rgba("#4088d8"),
            "hat": rgba("#245cbb"), "hat_band": PAL["gold_light"],
        }),
        "character4": ("hunter", {
            "jacket": rgba("#5d9f4f"), "jacket_dark": rgba("#264d2b"), "belt": rgba("#a86b32"),
            "hair": rgba("#5a3018"), "skin": rgba("#ffc080"), "skin_shadow": rgba("#ba7048"),
            "boots": rgba("#233118"), "scarf": rgba("#ff9f4a"), "scarf_dark": rgba("#9a4e24"),
            "accent": rgba("#5dff9c"), "weapon": rgba("#8a5a30"), "hood": rgba("#3d6f2e"),
            "hat": rgba("#3d6f2e"), "hat_band": rgba("#ff9f4a"),
        }),
    }


def generate_characters(manifest: dict[str, dict]) -> None:
    animations = {
        "idle": 4,
        "walking": 6,
        "running": 6,
        "jumping": 2,
        "falling": 2,
        "kick": 3,
        "shooting": 4,
        "lying_dead": 2,
    }
    for char_id, (kind, pal) in character_palettes().items():
        main = draw_character(kind, "idle", 0, pal)
        save(main, f"playable_characters/{char_id}/main_body.png", manifest)
        save(main, f"playable_characters/{char_id}/idle_body.png", manifest)
        for anim, count in animations.items():
            for i in range(count):
                img = draw_character(kind, anim, i, pal)
                save(img, f"playable_characters/{char_id}/{anim}_frame{i + 1}.png", manifest)


def platform(w: int = 32, h: int = 18, variant: str = "moss") -> Image.Image:
    img = canvas(w, max(h, 24))
    d = ImageDraw.Draw(img)
    y = 5
    body = PAL["stone_dark"]
    light = PAL["stone_mid"]
    grass = PAL["grass"]
    grass_dark = PAL["grass_dark"]
    if variant in {"snow", "ice", "crumble"}:
        body = rgba("#4c5e78")
        light = rgba("#7f96b8")
        grass = PAL["snow"]
        grass_dark = PAL["snow_shadow"]
    if variant == "summit":
        body = rgba("#b8c5d4")
        light = rgba("#fff6d0")
        grass = rgba("#e9f2ff")
        grass_dark = rgba("#c7dcf3")
    d.rectangle((0, y + 3, w - 1, y + h - 1), fill=PAL["stone_deep"])
    d.rectangle((1, y + 4, w - 2, y + h - 2), fill=body)
    for x in range(3, w - 4, 8):
        d.rectangle((x, y + 8, min(w - 3, x + 4), y + 9), fill=light)
    d.rectangle((1, y, w - 2, y + 6), fill=PAL["soil"] if variant == "moss" or variant in {"cracked", "roots", "runes", "flowers"} else rgba("#6f7890"))
    d.rectangle((0, y - 2, w - 1, y + 1), fill=grass_dark)
    d.rectangle((2, y - 4, w - 4, y - 2), fill=grass)
    if variant in {"snow", "ice", "crumble", "summit"}:
        d.rectangle((0, y - 4, w - 1, y), fill=PAL["snow_shadow"])
        d.rectangle((2, y - 6, w - 4, y - 3), fill=PAL["snow"])
    if variant == "ice":
        d.rectangle((4, y + 8, 8, y + 15), fill=PAL["cyan_dark"])
        d.rectangle((5, y + 8, 7, y + 14), fill=PAL["cyan"])
    if variant == "summit":
        d.rectangle((4, y + 7, w - 5, y + 8), fill=PAL["gold_light"])
        d.rectangle((w // 2 - 3, y + 10, w // 2 + 3, y + 11), fill=PAL["cyan_light"])
    if variant == "cracked":
        d.line((w // 2, y + 5, w // 2 - 2, y + 12, w // 2 + 1, y + 17), fill=PAL["outline"], width=1)
    if variant == "crumble":
        for x in range(7, w - 6, 10):
            d.line((x, y - 4, x + 2, y + 2, x, y + 9), fill=rgba("#8fa5c0"), width=1)
    if variant == "roots":
        for x in range(4, w - 4, 8):
            d.rectangle((x, y + h - 2, x + 1, y + h + 5), fill=PAL["soil_dark"])
    if variant == "runes":
        d.rectangle((w // 2 - 3, y + 8, w // 2 + 3, y + 9), fill=PAL["cyan"])
        d.rectangle((w // 2, y + 6, w // 2 + 1, y + 13), fill=PAL["cyan_light"])
    if variant == "flowers":
        for x, c in ((6, PAL["pink"]), (14, PAL["gold_light"]), (24, PAL["white"])):
            if x < w - 2:
                d.rectangle((x, y - 8, x + 2, y - 6), fill=c)
                d.point((x + 1, y - 7), fill=PAL["gold_light"])
    return img


def platform_variant(kind: str) -> Image.Image:
    if kind == "pillar":
        img = canvas(32, 56)
        d = ImageDraw.Draw(img)
        d.rectangle((6, 4, 26, 52), fill=PAL["stone_deep"])
        d.rectangle((8, 5, 24, 50), fill=rgba("#4c5e78"))
        d.rectangle((4, 0, 28, 8), fill=PAL["snow_shadow"])
        d.rectangle((6, 0, 26, 4), fill=PAL["snow"])
        d.rectangle((10, 17, 22, 18), fill=rgba("#7f96b8"))
        d.rectangle((9, 34, 23, 35), fill=rgba("#26354a"))
        return img
    if kind == "cliff":
        img = canvas(64, 40)
        d = ImageDraw.Draw(img)
        d.polygon([(0, 8), (60, 6), (63, 17), (47, 39), (15, 34), (2, 19)], fill=PAL["stone_deep"])
        d.polygon([(3, 9), (59, 8), (60, 17), (45, 35), (16, 31), (5, 19)], fill=rgba("#4c5e78"))
        d.rectangle((0, 3, 62, 8), fill=PAL["snow_shadow"])
        d.rectangle((4, 0, 58, 4), fill=PAL["snow"])
        for x in (14, 28, 45):
            d.line((x, 11, x + 8, 29), fill=rgba("#26354a"), width=1)
        return img
    if kind == "floating_snow":
        img = floating_island()
        d = ImageDraw.Draw(img)
        d.rectangle((8, 2, 86, 10), fill=PAL["snow_shadow"])
        d.rectangle((12, 0, 78, 5), fill=PAL["snow"])
        return img
    return platform(32, 18, kind)


def floating_island() -> Image.Image:
    img = canvas(96, 56)
    d = ImageDraw.Draw(img)
    d.polygon([(8, 12), (84, 10), (92, 22), (70, 44), (48, 54), (25, 43), (4, 25)], fill=PAL["stone_deep"])
    d.polygon([(12, 12), (82, 11), (88, 21), (68, 39), (48, 49), (27, 38), (9, 24)], fill=PAL["stone_dark"])
    for x, y, w, h in [(18, 20, 12, 9), (35, 17, 16, 11), (56, 20, 18, 12), (30, 32, 13, 8), (50, 36, 12, 7)]:
        d.rectangle((x, y, x + w, y + h), fill=PAL["stone_mid"])
        d.rectangle((x, y, x + w, y + 1), fill=PAL["stone_light"])
    d.rectangle((8, 7, 86, 14), fill=PAL["soil"])
    d.rectangle((7, 5, 88, 8), fill=PAL["grass_dark"])
    d.rectangle((12, 3, 78, 5), fill=PAL["grass"])
    for x in (22, 35, 63, 75):
        d.rectangle((x, 0, x + 1, 5), fill=PAL["grass"])
    return img


def grass_clump() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((1, 13, 14, 15), fill=PAL["grass_dark"])
    for x, h in [(2, 5), (5, 8), (8, 6), (12, 7)]:
        d.rectangle((x, 13 - h, x + 1, 13), fill=PAL["moss_light"])
        d.point((x, 13 - h), fill=PAL["grass"])
    return img


def flower_patch() -> Image.Image:
    img = grass_clump()
    d = ImageDraw.Draw(img)
    for x, y, c in [(4, 7, PAL["pink"]), (8, 6, PAL["gold_light"]), (12, 8, PAL["white"])]:
        d.rectangle((x, y, x + 2, y + 2), fill=c)
        d.point((x + 1, y + 1), fill=PAL["gold_dark"])
    return img


def bush(w: int = 32, h: int = 24, autumn: bool = False) -> Image.Image:
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    leaf = rgba("#cf6b4f") if autumn else PAL["leaf_mid"]
    light = rgba("#f08a5f") if autumn else PAL["leaf_light"]
    d.rectangle((5, 13, w - 6, h - 4), fill=PAL["leaf_dark"])
    for box in [(2, 10, 14, 19), (9, 6, 23, 17), (18, 9, 30, 20), (7, 14, 25, 23)]:
        d.ellipse(box, fill=leaf)
    for box in [(8, 8, 15, 12), (16, 7, 23, 11), (21, 11, 28, 15)]:
        d.rectangle(box, fill=light)
    d.rectangle((10, h - 5, 22, h - 3), fill=PAL["shadow"])
    return img


def leaf_cluster() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    for box in [(1, 7, 8, 13), (5, 4, 14, 12), (7, 9, 15, 15), (2, 3, 9, 9)]:
        d.ellipse(box, fill=PAL["leaf_mid"])
    d.rectangle((5, 5, 9, 7), fill=PAL["leaf_light"])
    d.rectangle((8, 10, 12, 12), fill=PAL["leaf_light"])
    return img


def tree(kind: str = "pine") -> Image.Image:
    img = canvas(64, 88)
    d = ImageDraw.Draw(img)
    d.rectangle((29, 44, 36, 82), fill=PAL["bark_dark"])
    d.rectangle((31, 42, 38, 82), fill=PAL["bark"])
    if kind == "dead":
        d.rectangle((20, 28, 43, 34), fill=PAL["bark_dark"])
        d.line((34, 42, 48, 24), fill=PAL["bark"], width=3)
        d.line((30, 45, 16, 29), fill=PAL["bark"], width=3)
        d.line((38, 58, 52, 48), fill=PAL["bark"], width=2)
        d.line((28, 60, 13, 54), fill=PAL["bark"], width=2)
        return img
    if kind == "pine":
        for y, half in [(8, 15), (20, 21), (34, 26), (50, 30)]:
            d.polygon([(32, y), (32 - half, y + 25), (32 + half, y + 25)], fill=PAL["leaf_dark"])
            d.polygon([(32, y + 3), (32 - half + 4, y + 22), (32 + half - 4, y + 22)], fill=PAL["leaf_mid"])
            d.rectangle((25, y + 17, 36, y + 19), fill=PAL["leaf_light"])
    else:
        for box in [(6, 8, 35, 36), (24, 5, 57, 35), (14, 26, 48, 57), (0, 29, 26, 55), (36, 31, 63, 59)]:
            d.ellipse(box, fill=PAL["leaf_dark"])
        for box in [(10, 11, 32, 29), (27, 8, 51, 28), (18, 28, 43, 47)]:
            d.ellipse(box, fill=PAL["leaf_light"])
    return img


def snow_tree(kind: str = "snow") -> Image.Image:
    img = tree("pine")
    d = ImageDraw.Draw(img)
    if kind == "bent":
        img = canvas(64, 88)
        d = ImageDraw.Draw(img)
        d.line((35, 78, 42, 45, 36, 22), fill=PAL["bark_dark"], width=7)
        d.line((36, 78, 42, 45, 36, 22), fill=PAL["bark"], width=3)
        for y, half, shift in [(10, 15, -3), (24, 20, -7), (40, 26, -11), (56, 30, -14)]:
            d.polygon([(34 + shift, y), (34 - half + shift, y + 22), (34 + half + shift, y + 22)], fill=PAL["leaf_dark"])
            d.polygon([(34 + shift, y + 4), (34 - half + 4 + shift, y + 20), (34 + half - 4 + shift, y + 20)], fill=PAL["leaf_mid"])
    for box in [(18, 19, 41, 24), (13, 34, 49, 39), (6, 52, 55, 58), (23, 66, 44, 70)]:
        d.rectangle(box, fill=PAL["snow"])
        d.rectangle((box[0], box[3], box[2], box[3] + 1), fill=PAL["snow_shadow"])
    return img


def stump() -> Image.Image:
    img = canvas(24, 24)
    d = ImageDraw.Draw(img)
    d.rectangle((6, 8, 18, 21), fill=PAL["bark_dark"])
    d.rectangle((7, 7, 19, 19), fill=PAL["bark"])
    d.ellipse((5, 3, 20, 11), fill=PAL["bark_dark"])
    d.ellipse((7, 4, 18, 10), fill=PAL["stone_light"])
    d.rectangle((4, 19, 21, 22), fill=PAL["grass_dark"])
    return img


def mushroom_cluster() -> Image.Image:
    img = canvas(24, 24)
    d = ImageDraw.Draw(img)
    for x, y, c in [(4, 10, PAL["red"]), (12, 7, PAL["orange"]), (16, 12, PAL["pink"])]:
        d.rectangle((x + 2, y + 6, x + 4, y + 14), fill=PAL["white"])
        d.ellipse((x, y, x + 9, y + 7), fill=PAL["outline"])
        d.ellipse((x + 1, y, x + 8, y + 6), fill=c)
        d.point((x + 3, y + 2), fill=PAL["white"])
    return img


def cloud(w: int, h: int, flat: bool = False) -> Image.Image:
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    y = h // 2
    d.rectangle((w // 12, y, w - w // 10, y + h // 4), fill=PAL["cloud_shadow"])
    parts = [
        (w * 0.06, y - h * 0.08, w * 0.30, y + h * 0.30),
        (w * 0.22, y - h * 0.34, w * 0.52, y + h * 0.24),
        (w * 0.45, y - h * 0.22, w * 0.75, y + h * 0.28),
        (w * 0.68, y - h * 0.05, w * 0.94, y + h * 0.30),
    ]
    for i, box in enumerate(parts):
        if flat and i == 1:
            box = (box[0], y - h * 0.18, box[2], y + h * 0.18)
        d.ellipse(tuple(map(int, box)), fill=PAL["cloud_mid"])
    for box in parts[1:3]:
        x0, y0, x1, y1 = map(int, box)
        d.rectangle((x0 + 5, y0 + 4, x1 - 5, y0 + 8), fill=PAL["cloud"])
    return img


def coin(width: int = 10) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    x = (16 - width) // 2
    if width <= 2:
        d.rectangle((7, 2, 8, 14), fill=PAL["gold_dark"])
        d.rectangle((8, 2, 8, 13), fill=PAL["gold_light"])
        return img
    d.ellipse((x, 1, x + width, 14), fill=PAL["gold_dark"])
    d.ellipse((x + 1, 2, x + width - 1, 13), fill=PAL["gold"])
    d.rectangle((x + 3, 4, x + width - 3, 5), fill=PAL["gold_light"])
    d.rectangle((x + width - 2, 5, x + width - 1, 11), fill=PAL["gold_dark"])
    return img


def gem(color: tuple[int, int, int, int], light: tuple[int, int, int, int], dark: tuple[int, int, int, int]) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.polygon([(8, 1), (14, 6), (11, 14), (5, 14), (2, 6)], fill=dark)
    d.polygon([(8, 2), (13, 6), (10, 13), (6, 13), (3, 6)], fill=color)
    d.polygon([(7, 3), (11, 6), (8, 8), (5, 6)], fill=light)
    d.rectangle((6, 12, 10, 13), fill=PAL["white"])
    return img


def seed(frame: int = 0) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.ellipse((4, 4, 12, 13), fill=PAL["leaf_dark"])
    d.ellipse((5, 3, 12, 12), fill=PAL["moss_light"])
    d.rectangle((8, 1, 12 + frame % 2, 3), fill=PAL["grass"])
    d.rectangle((6, 5, 8, 7), fill=PAL["white"])
    return img


def star_shard(frame: int = 0) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    c = [PAL["cyan"], PAL["green"], PAL["violet"], PAL["gold_light"]][frame % 4]
    d.polygon([(8, 1), (10, 6), (15, 8), (10, 10), (8, 15), (6, 10), (1, 8), (6, 6)], fill=PAL["outline"])
    d.polygon([(8, 2), (9, 7), (14, 8), (9, 9), (8, 14), (7, 9), (2, 8), (7, 7)], fill=c)
    d.point((8, 4), fill=PAL["white"])
    return img


def ring(size: int = 24, color: tuple[int, int, int, int] = PAL["cyan"]) -> Image.Image:
    img = canvas(size, size)
    d = ImageDraw.Draw(img)
    d.ellipse((2, 6, size - 3, size - 7), outline=color, width=2)
    d.ellipse((6, 9, size - 7, size - 10), outline=PAL["cyan_light"], width=1)
    return img


def sparkle() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((7, 1, 8, 15), fill=PAL["cyan_light"])
    d.rectangle((1, 7, 15, 8), fill=PAL["cyan"])
    d.rectangle((5, 5, 10, 10), fill=PAL["white"])
    return img


def spikes() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 11, 15, 15), fill=PAL["stone_deep"])
    for x in (1, 6, 11):
        d.polygon([(x, 11), (x + 2, 1), (x + 4, 11)], fill=PAL["red"])
        d.line((x + 2, 2, x + 2, 9), fill=PAL["orange"])
        d.point((x + 2, 1), fill=PAL["white"])
    return img


def lantern(glow: tuple[int, int, int, int] = PAL["cyan"], post: bool = False) -> Image.Image:
    img = canvas(16, 40 if post else 24)
    d = ImageDraw.Draw(img)
    y = 2
    if post:
        d.rectangle((7, 20, 9, 38), fill=PAL["bark_dark"])
        d.rectangle((3, 38, 13, 39), fill=PAL["bark"])
    d.rectangle((7, y, 9, y + 3), fill=PAL["bark_dark"])
    d.rectangle((4, y + 3, 12, y + 5), fill=PAL["bark"])
    d.rectangle((3, y + 6, 13, y + 18), fill=PAL["outline"])
    d.rectangle((5, y + 7, 11, y + 17), fill=PAL["cyan_dark"])
    d.rectangle((6, y + 8, 10, y + 16), fill=glow)
    d.rectangle((7, y + 9, 9, y + 15), fill=PAL["gold_light"])
    d.rectangle((4, y + 19, 12, y + 21), fill=PAL["bark_dark"])
    return img


def signpost() -> Image.Image:
    img = canvas(16, 24)
    d = ImageDraw.Draw(img)
    d.rectangle((7, 8, 10, 23), fill=PAL["bark_dark"])
    d.rectangle((2, 5, 15, 12), fill=PAL["outline"])
    d.rectangle((3, 6, 14, 11), fill=PAL["bark"])
    d.rectangle((5, 8, 11, 9), fill=PAL["gold_light"])
    return img


def fence() -> Image.Image:
    img = canvas(32, 16)
    d = ImageDraw.Draw(img)
    for x in (3, 13, 23):
        d.rectangle((x, 2, x + 3, 15), fill=PAL["bark_dark"])
        d.rectangle((x + 1, 1, x + 2, 14), fill=PAL["bark"])
    d.rectangle((0, 6, 31, 9), fill=PAL["bark_dark"])
    d.rectangle((1, 5, 30, 7), fill=PAL["bark"])
    return img


def rope_bridge() -> Image.Image:
    img = canvas(48, 16)
    d = ImageDraw.Draw(img)
    d.line((0, 4, 47, 4), fill=PAL["bark_dark"], width=1)
    d.line((0, 11, 47, 11), fill=PAL["bark_dark"], width=1)
    for x in range(2, 46, 6):
        d.rectangle((x, 6, x + 4, 10), fill=PAL["bark"])
        d.rectangle((x, 10, x + 4, 11), fill=PAL["bark_dark"])
        d.line((x, 4, x + 1, 11), fill=PAL["gold_dark"])
    return img


def crate(w: int = 32, h: int = 32) -> Image.Image:
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    d.rectangle((3, 4, w - 4, h - 3), fill=PAL["outline"])
    d.rectangle((5, 6, w - 6, h - 5), fill=PAL["bark"])
    d.rectangle((7, 8, w - 8, h - 7), outline=PAL["bark_dark"], width=2)
    d.line((8, 8, w - 8, h - 8), fill=PAL["bark_dark"], width=2)
    d.line((w - 8, 8, 8, h - 8), fill=PAL["bark_dark"], width=2)
    return img


def barrel() -> Image.Image:
    img = canvas(24, 32)
    d = ImageDraw.Draw(img)
    d.ellipse((3, 2, 20, 8), fill=PAL["bark_dark"])
    d.rectangle((3, 5, 20, 26), fill=PAL["outline"])
    d.rectangle((5, 5, 18, 27), fill=PAL["bark"])
    d.ellipse((4, 23, 19, 30), fill=PAL["bark_dark"])
    d.rectangle((4, 11, 19, 13), fill=PAL["stone_mid"])
    d.rectangle((4, 20, 19, 22), fill=PAL["stone_mid"])
    return img


def ruin_column() -> Image.Image:
    img = canvas(24, 40)
    d = ImageDraw.Draw(img)
    d.rectangle((6, 4, 18, 37), fill=PAL["stone_deep"])
    d.rectangle((8, 5, 16, 36), fill=PAL["stone_cool"])
    d.rectangle((4, 2, 20, 6), fill=PAL["stone_light"])
    d.rectangle((3, 35, 21, 39), fill=PAL["stone_dark"])
    d.rectangle((9, 13, 15, 14), fill=PAL["stone_light"])
    d.rectangle((8, 24, 16, 25), fill=PAL["stone_dark"])
    return img


def ruin_arch() -> Image.Image:
    img = canvas(32, 32)
    d = ImageDraw.Draw(img)
    d.rectangle((5, 12, 10, 30), fill=PAL["stone_deep"])
    d.rectangle((22, 12, 27, 30), fill=PAL["stone_deep"])
    d.rectangle((6, 13, 9, 29), fill=PAL["stone_cool"])
    d.rectangle((23, 13, 26, 29), fill=PAL["stone_cool"])
    d.rectangle((8, 7, 24, 12), fill=PAL["stone_deep"])
    d.rectangle((10, 5, 22, 9), fill=PAL["stone_light"])
    d.rectangle((14, 11, 17, 13), fill=PAL["cyan"])
    return img


def portal_arch() -> Image.Image:
    img = canvas(64, 64)
    d = ImageDraw.Draw(img)
    d.ellipse((12, 8, 52, 58), outline=PAL["cyan"], width=3)
    d.ellipse((18, 15, 46, 55), outline=PAL["cyan_light"], width=1)
    d.rectangle((8, 26, 18, 61), fill=PAL["stone_deep"])
    d.rectangle((46, 26, 56, 61), fill=PAL["stone_deep"])
    d.rectangle((11, 27, 16, 59), fill=PAL["stone_cool"])
    d.rectangle((48, 27, 53, 59), fill=PAL["stone_cool"])
    d.rectangle((13, 14, 51, 26), fill=PAL["stone_deep"])
    d.rectangle((18, 12, 46, 17), fill=PAL["stone_light"])
    for x in (24, 32, 40):
        d.rectangle((x, 19, x + 2, 22), fill=PAL["cyan_light"])
    return img


def hud_panel() -> Image.Image:
    img = canvas(96, 48)
    d = ImageDraw.Draw(img)
    d.rectangle((3, 4, 95, 47), fill=PAL["shadow"])
    d.rectangle((0, 0, 91, 43), fill=PAL["outline"])
    d.rectangle((3, 3, 88, 40), fill=(8, 14, 24, 255))
    d.rectangle((4, 4, 87, 5), fill=(42, 64, 96, 255))
    d.rectangle((4, 6, 87, 7), fill=PAL["cyan"])
    d.rectangle((8, 12, 28, 28), fill=PAL["stone_dark"])
    d.rectangle((34, 12, 78, 16), fill=PAL["stone_dark"])
    d.rectangle((34, 22, 70, 26), fill=PAL["stone_dark"])
    d.rectangle((8, 33, 48, 36), fill=PAL["stone_dark"])
    return img


def crown() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.polygon([(2, 6), (5, 2), (8, 6), (11, 2), (14, 6), (13, 13), (3, 13)], fill=PAL["gold_dark"])
    d.polygon([(3, 7), (5, 4), (8, 8), (11, 4), (13, 7), (12, 12), (4, 12)], fill=PAL["gold"])
    d.rectangle((6, 10, 10, 11), fill=PAL["gold_light"])
    d.point((8, 7), fill=PAL["cyan"])
    return img


def height_arrow() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.polygon([(8, 1), (14, 8), (10, 8), (10, 15), (6, 15), (6, 8), (2, 8)], fill=PAL["cyan_dark"])
    d.polygon([(8, 2), (13, 8), (9, 8), (9, 14), (7, 14), (7, 8), (3, 8)], fill=PAL["cyan"])
    return img


def mountain_panorama(w: int, h: int) -> Image.Image:
    if BACKGROUND_SOURCE.exists():
        source = Image.open(BACKGROUND_SOURCE).convert("RGBA")
        scale = max(w / source.width, h / source.height)
        resized = source.resize((max(1, round(source.width * scale)), max(1, round(source.height * scale))), Image.Resampling.LANCZOS)
        left = max(0, (resized.width - w) // 2)
        top = max(0, (resized.height - h) // 2)
        return resized.crop((left, top, left + w, top + h))

    img = canvas(w, h)
    d = ImageDraw.Draw(img)

    def mix(a: tuple[int, int, int, int], b: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
        return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(4))

    def ridge(points: list[tuple[float, float]], color: tuple[int, int, int, int]) -> None:
        d.polygon([(round(x), round(y)) for x, y in points], fill=color)

    def mountain(cx: float, peak_y: float, base_y: float, half_w: float, shade: tuple[int, int, int, int], light: tuple[int, int, int, int], snow: bool = True) -> None:
        left = [(cx - half_w, base_y), (cx - half_w * 0.55, peak_y + (base_y - peak_y) * 0.42), (cx, peak_y)]
        right = [(cx, peak_y), (cx + half_w * 0.42, peak_y + (base_y - peak_y) * 0.33), (cx + half_w, base_y)]
        ridge(left + right + [(cx - half_w, base_y)], shade)
        ridge([(cx, peak_y), (cx + half_w * 0.42, peak_y + (base_y - peak_y) * 0.33), (cx + half_w, base_y), (cx + half_w * 0.16, base_y)], mix(shade, rgba("#192e50"), 0.35))
        for i in range(9):
            t = i / 8
            x = cx - half_w * (0.52 - t * 0.26)
            y = peak_y + (base_y - peak_y) * (0.12 + t * 0.66)
            d.line((x, y, x + half_w * 0.28, y + (i % 3 - 1) * 22 + 70), fill=mix(light, shade, 0.25), width=max(1, round(w / 190)))
        for i in range(10):
            t = i / 9
            x = cx + half_w * (0.08 + t * 0.52)
            y = peak_y + (base_y - peak_y) * (0.10 + t * 0.64)
            d.line((x, y, x - half_w * 0.20, y + 76), fill=mix(rgba("#153256"), shade, 0.25), width=max(1, round(w / 210)))
        if snow:
            ridge([(cx, peak_y), (cx - half_w * 0.14, peak_y + 120), (cx - half_w * 0.03, peak_y + 96), (cx - half_w * 0.22, peak_y + 230), (cx + half_w * 0.02, peak_y + 150), (cx + half_w * 0.12, peak_y + 255), (cx + half_w * 0.23, peak_y + 115)], rgba("#e9f2ff", 245))
            ridge([(cx + half_w * 0.04, peak_y + 22), (cx + half_w * 0.17, peak_y + 125), (cx + half_w * 0.09, peak_y + 118)], rgba("#bcd4ef", 230))

    sky_top = rgba("#2d68aa")
    sky_mid = rgba("#64a6e2")
    horizon = rgba("#b7d7ee")
    for y in range(h):
        t = y / h
        if t < 0.42:
            c = mix(sky_top, sky_mid, t / 0.42)
        else:
            c = mix(sky_mid, horizon, min(1, (t - 0.42) / 0.38))
        d.line((0, y, w, y), fill=c)

    for cx, cy, cw, ch in [
        (w * 0.22, h * 0.19, w * 0.34, h * 0.10),
        (w * 0.76, h * 0.22, w * 0.42, h * 0.08),
        (w * 0.70, h * 0.38, w * 0.35, h * 0.09),
    ]:
        for i in range(16):
            x = cx - cw / 2 + (i * 37 % round(cw))
            y = cy + (i * 17 % round(ch)) - ch * 0.35
            rx = cw * (0.08 + (i % 4) * 0.012)
            ry = ch * (0.22 + (i % 3) * 0.045)
            d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=rgba("#edf6ff", 190 if i % 4 else 230))
        d.rectangle((round(cx - cw * 0.50), round(cy + ch * 0.20), round(cx + cw * 0.52), round(cy + ch * 0.32)), fill=rgba("#c5def4", 130))

    mountain(w * 0.62, h * 0.20, h * 0.60, w * 0.36, rgba("#3b6a9d"), rgba("#9fc4e8"))
    mountain(w * 0.36, h * 0.29, h * 0.62, w * 0.26, rgba("#315c91"), rgba("#9fc4e8"))
    mountain(w * 0.87, h * 0.31, h * 0.61, w * 0.20, rgba("#365f91"), rgba("#a8c7e7"))
    mountain(w * 0.08, h * 0.34, h * 0.66, w * 0.20, rgba("#2f527f"), rgba("#8fb1d4"), snow=False)

    for base, col, haze in [
        (0.58, rgba("#5b7fa8", 180), rgba("#d4e7f6", 62)),
        (0.67, rgba("#355d88", 210), rgba("#c7def1", 70)),
        (0.77, rgba("#24476e", 235), rgba("#a9c7e4", 82)),
        (0.90, rgba("#173456", 255), rgba("#91b8dc", 95)),
    ]:
        y = h * base
        pts = [(0, h)]
        for i in range(10):
            x = (i - 1) * w / 8
            py = y - ((i * 97) % round(h * 0.12))
            pts.append((x, py))
        pts.append((w, h))
        ridge(pts, col)
        d.rectangle((0, round(y - h * 0.03), w, round(y + h * 0.035)), fill=haze)

    valley = [(w * 0.43, h * 0.68), (w * 0.53, h * 0.75), (w * 0.48, h * 0.86), (w * 0.57, h)]
    ridge([(w * 0.28, h), *valley, (w * 0.72, h), (w * 0.60, h * 0.82), (w * 0.52, h * 0.70), (w * 0.46, h * 0.62), (w * 0.36, h * 0.78)], rgba("#4c6e6e", 190))
    for i in range(8):
        y = h * (0.76 + i * 0.028)
        x = w * (0.47 + math.sin(i) * 0.055)
        d.line((x, y, x + w * 0.08, y + h * 0.055), fill=rgba("#8fc7ec", 155), width=max(1, round(w / 290)))

    for x in range(-20, w + 20, max(8, round(w / 80))):
        local = (x * 37) % 100
        tree_h = round(h * (0.018 + local / 10000))
        y = h - tree_h - ((x * 19) % round(h * 0.14))
        color = rgba("#0e2942", 240) if y > h * 0.82 else rgba("#1d3f4c", 210)
        d.rectangle((x, y + tree_h // 2, x + max(1, round(w / 250)), y + tree_h), fill=rgba("#0a1c2c", 240))
        d.polygon([(x + 2, y), (x - tree_h * 0.25, y + tree_h * 0.72), (x + tree_h * 0.35, y + tree_h * 0.72)], fill=color)
        d.polygon([(x + 2, y + tree_h * 0.32), (x - tree_h * 0.28, y + tree_h), (x + tree_h * 0.38, y + tree_h)], fill=color)

    for y in range(0, h, 3):
        for x in range((y * 31) % 11, w, 23):
            if (x * 17 + y * 13) % 19 == 0:
                r, g, b, a = img.getpixel((x, y))
                delta = ((x * 7 + y * 11) % 13) - 6
                img.putpixel((x, y), (max(0, min(255, r + delta)), max(0, min(255, g + delta)), max(0, min(255, b + delta)), a))
    return img


def sky_arches(w: int = 768, h: int = 432) -> Image.Image:
    img = mountain_panorama(w, h)
    d = ImageDraw.Draw(img)
    for x, tw, th in [(60, 70, 180), (250, 95, 230), (510, 110, 210)]:
        y = h - th - 40
        d.rectangle((x, y + 30, x + tw, h - 35), fill=rgba("#222e48", 135))
        d.rectangle((x - 8, y + 22, x + tw + 8, y + 35), fill=rgba("#606858", 160))
        d.rectangle((x + tw // 2 - 3, y + 55, x + tw // 2 + 3, y + 105), fill=rgba("#40d8f8", 70))
    return img


def generate_environment(manifest: dict[str, dict]) -> None:
    assets: list[tuple[str, Image.Image]] = [
        ("environment/backgrounds/mountain_panorama.png", mountain_panorama(887, 1774)),
        ("environment/backgrounds/mountain_wide.png", mountain_panorama(1024, 192)),
        ("environment/backgrounds/mountain_wide_alt.png", mountain_panorama(1024, 192).transpose(Image.Transpose.FLIP_LEFT_RIGHT)),
        ("environment/backgrounds/mountain_tall.png", mountain_panorama(192, 384)),
        ("environment/backgrounds/forest_ruins_panorama.png", sky_arches(1024, 576)),
        ("environment/backgrounds/cloud_bank.png", cloud(768, 128, flat=True)),
        ("environment/backgrounds/sky_arches.png", sky_arches()),
        ("environment/backgrounds/cloud_small.png", cloud(64, 28)),
        ("environment/backgrounds/cloud.png", cloud(96, 40)),
        ("environment/backgrounds/cloud_tall.png", cloud(80, 56)),
        ("environment/backgrounds/cloud_long.png", cloud(144, 48)),
        ("environment/backgrounds/cloud_wispy.png", cloud(128, 32, flat=True)),
        ("environment/backgrounds/cloud_cluster.png", cloud(160, 64)),
        ("environment/backgrounds/cloud_flat.png", cloud(192, 36, flat=True)),
        ("environment/backgrounds/cloud_streak.png", cloud(224, 32, flat=True)),
        ("environment/backgrounds/cloud_puff.png", cloud(112, 56)),
        ("environment/mountainBackgrounds/alpine_valley.png", mountain_panorama(887, 1774)),
        ("environment/clouds/background_cloud_huge.png", cloud(192, 64)),
        ("environment/clouds/midground_cloud.png", cloud(112, 40)),
        ("environment/clouds/fast_cloud_streak.png", cloud(224, 32, flat=True)),
        ("environment/platforms/floating_island_1.png", floating_island()),
        ("environment/platforms/moss_platform_1.png", platform(32, 18, "moss")),
        ("environment/platforms/moss_platform_cracked_1.png", platform(32, 18, "cracked")),
        ("environment/platforms/moss_platform_overhang_1.png", platform(32, 18, "roots")),
        ("environment/platforms/moss_platform_flowers_1.png", platform(32, 18, "flowers")),
        ("environment/platforms/moss_platform_roots_1.png", platform(32, 18, "roots")),
        ("environment/platforms/moss_platform_runes_1.png", platform(32, 18, "runes")),
        ("environment/platforms/stone_ledge_1.png", platform(48, 18, "snow")),
        ("environment/platforms/grass_bridge_1.png", platform(64, 18, "flowers")),
        ("environment/platformVariants/green_platform.png", platform(32, 18, "moss")),
        ("environment/platformVariants/cloud_ridge_platform.png", platform(32, 18, "snow")),
        ("environment/platformVariants/snow_platform.png", platform(32, 18, "ice")),
        ("environment/platformVariants/frozen_platform.png", platform_variant("floating_snow")),
        ("environment/platformVariants/summit_platform.png", platform(32, 18, "summit")),
        ("environment/platformVariants/tall_pillar.png", platform_variant("pillar")),
        ("environment/platformVariants/broken_cliff.png", platform_variant("cliff")),
        ("environment/platformVariants/crumbling_platform.png", platform(32, 18, "crumble")),
        ("environment/terrainTiles/stone_grass_tile.png", platform(16, 16, "moss").crop((0, 0, 16, 16))),
        ("environment/snowTiles/snow_cap_tile.png", platform(16, 16, "snow").crop((0, 0, 16, 16))),
        ("environment/mossTiles/mossy_stone_tile.png", platform(16, 16, "roots").crop((0, 0, 16, 16))),
        ("environment/ruinTiles/rune_stone_tile.png", platform(16, 16, "runes").crop((0, 0, 16, 16))),
        ("environment/vegetation/grass_clump_1.png", grass_clump()),
        ("environment/vegetation/flower_patch_1.png", flower_patch()),
        ("environment/vegetation/leaf_cluster_1.png", leaf_cluster()),
        ("environment/vegetation/bush_1.png", bush()),
        ("environment/vegetation/bush_autumn_1.png", bush(32, 24, autumn=True)),
        ("environment/vegetation/tree_pine_1.png", tree("pine")),
        ("environment/vegetation/tree_oak_1.png", tree("oak")),
        ("environment/vegetation/tree_dead_1.png", tree("dead")),
        ("environment/pineTrees/alpine_pine.png", tree("pine")),
        ("environment/pineTrees/wind_bent_pine.png", snow_tree("bent")),
        ("environment/snowTrees/snow_pine.png", snow_tree("snow")),
        ("environment/snowTrees/frosted_bent_pine.png", snow_tree("bent")),
        ("environment/vegetation/stump_1.png", stump()),
        ("environment/vegetation/mushroom_cluster_1.png", mushroom_cluster()),
        ("environment/vegetation/moss_patch_1.png", platform(24, 10, "moss")),
        ("environment/vegetation/vine_hanging_1.png", vine()),
        ("environment/vegetation/pebble_cluster_1.png", pebbles()),
        ("environment/rocks/stone_cap_1.png", stone_cap()),
        ("environment/rocks/rock_cluster_plain_1.png", rock_cluster("plain")),
        ("environment/rocks/rock_cluster_moss_1.png", rock_cluster("moss")),
        ("environment/rocks/rock_spire_1.png", rock_cluster("tall")),
        ("environment/flora/reed_grass_wheat_1.png", reed_grass("wheat")),
        ("environment/flora/reed_grass_yellow_1.png", reed_grass("yellow")),
        ("environment/flora/flower_pink_1.png", reed_grass("pink")),
        ("environment/flora/wildflower_mixed_1.png", wildflower_patch("mixed")),
        ("environment/flora/wildflower_pink_1.png", wildflower_patch("pink")),
        ("environment/flora/wildflower_yellow_1.png", wildflower_patch("yellow")),
        ("environment/hazards/spikes_1.png", spikes()),
        ("environment/hazards/crystal_spikes_1.png", crystal_spikes()),
        ("environment/hazards/thorn_vine_1.png", thorn_vine()),
        ("environment/hazards/falling_icicle_1.png", icicle()),
        ("environment/hazards/wind_zone_1.png", wind_ribbon()),
        ("environment/hazards/lightning_1.png", lightning_bolt()),
        ("environment/hazards/rolling_boulder_1.png", rolling_boulder()),
        ("environment/lights/lantern_cyan_1.png", lantern(PAL["cyan"])),
        ("environment/lights/lantern_gold_1.png", lantern(PAL["gold_light"])),
        ("environment/lights/torch_1.png", torch()),
        ("environment/lights/lamp_post_1.png", lantern(PAL["gold_light"], post=True)),
        ("environment/lanterns/wood_lantern.png", lantern(PAL["gold_light"])),
        ("environment/lanterns/crystal_lantern.png", lantern(PAL["cyan"])),
        ("environment/structures/signpost_1.png", signpost()),
        ("environment/structures/fence_1.png", fence()),
        ("environment/structures/rope_bridge_1.png", rope_bridge()),
        ("environment/ropeBridges/rope_bridge_worn.png", rope_bridge()),
        ("environment/structures/wooden_crate_1.png", crate()),
        ("environment/structures/barrel_1.png", barrel()),
        ("environment/structures/ruin_arch_fragment_1.png", ruin_arch()),
        ("environment/structures/ruin_column_1.png", ruin_column()),
        ("environment/structures/gate_1.png", gate()),
        ("environment/structures/ladder_1.png", ladder()),
        ("environment/ladders/frosted_wood_ladder.png", ladder()),
        ("environment/ladders/climbing_chain.png", climbing_chain()),
        ("environment/structures/banner_red_1.png", banner(PAL["red"])),
        ("environment/structures/banner_blue_1.png", banner(PAL["blue"])),
        ("environment/banners/pine_valley_banner.png", banner(PAL["green"])),
        ("environment/banners/summit_banner.png", banner(PAL["gold_light"])),
        ("environment/structures/rune_stone_1.png", rune_stone()),
        ("environment/structures/crystal_marker_1.png", crystal_marker()),
        ("environment/crystals/blue_movement_crystal.png", crystal_marker()),
        ("environment/crystals/green_healing_crystal.png", gem(PAL["green"], PAL["white"], PAL["leaf_dark"])),
        ("environment/crystals/red_relic_crystal.png", gem(PAL["red"], PAL["orange"], PAL["stone_deep"])),
        ("environment/effects/portal_arch_1.png", portal_arch()),
        ("environment/effects/collectible_ring_1.png", ring(24, PAL["cyan"])),
        ("environment/effects/collectible_ring_green_1.png", ring(24, PAL["green"])),
        ("environment/effects/collectible_sparkle_1.png", sparkle()),
        ("environment/effects/fog_strip_1.png", fog()),
        ("environment/effects/jump_pad_1.png", jump_pad()),
        ("environment/particleEffects/blue_rune_ring.png", ring(24, PAL["cyan"])),
        ("environment/particleEffects/wind_ribbon.png", wind_ribbon()),
        ("environment/relicShrines/relic_shrine_1.png", relic_shrine()),
        ("environment/relicShrines/ancient_beacon_1.png", ancient_beacon()),
        ("environment/relicShrines/jump_pad_1.png", jump_pad()),
        ("environment/enemies/goblin_1.png", enemy("goblin")),
        ("environment/enemies/archer_1.png", enemy("archer")),
        ("environment/enemies/ice_bat_1.png", enemy("ice_bat")),
        ("environment/enemies/skeleton_1.png", enemy("skeleton")),
        ("environment/enemies/yeti_1.png", enemy("yeti")),
        ("environment/enemies/wind_spirit_1.png", enemy("wind_spirit")),
        ("environment/ui/crown_1.png", crown()),
        ("environment/ui/height_arrow_1.png", height_arrow()),
        ("environment/ui/hud_panel_1.png", hud_panel()),
    ]

    for i, width in enumerate((10, 6, 2, 6), 1):
        assets.append((f"environment/collectibles/coin_spin_frame{i}.png", coin(width)))
    assets.append(("environment/collectibles/coin_1.png", coin(10)))
    for i, c in enumerate(((PAL["cyan"], PAL["cyan_light"], PAL["cyan_dark"]), (PAL["red"], PAL["orange"], PAL["stone_deep"]), (PAL["green"], PAL["white"], PAL["leaf_dark"]), (PAL["violet"], PAL["white"], PAL["ink"])), 1):
        assets.append((f"environment/collectibles/gem_variant{i}.png", gem(*c)))
    for i in range(4):
        assets.append((f"environment/collectibles/seed_green_frame{i + 1}.png", seed(i)))
        assets.append((f"environment/collectibles/star_shard_frame{i + 1}.png", star_shard(i)))
        assets.append((f"environment/collectibles/relic_pink_frame{i + 1}.png", relic(i)))
    assets.extend([
        ("environment/collectibles/heart_1.png", heart()),
        ("environment/collectibles/magic_orb_blue_1.png", magic_orb(PAL["cyan"])),
        ("environment/collectibles/magic_orb_gold_1.png", magic_orb(PAL["gold_light"])),
        ("environment/collectibles/potion_blue_1.png", potion()),
        ("environment/collectibles/exp_badge_1.png", exp_badge()),
        ("environment/collectibles/treasure_chest_1.png", treasure_chest()),
    ])
    for name, img in assets:
        save(img, name, manifest)

    for name, img in tile_assets().items():
        save(img, f"environment/tiles/{name}.png", manifest)


def vine() -> Image.Image:
    img = canvas(16, 24)
    d = ImageDraw.Draw(img)
    d.rectangle((7, 0, 8, 23), fill=PAL["moss"])
    for y in (4, 10, 17):
        d.rectangle((8, y, 12, y + 2), fill=PAL["moss_light"])
    return img


def pebbles() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    for box in [(1, 10, 6, 14), (6, 8, 12, 14), (11, 11, 15, 15), (4, 5, 8, 8)]:
        d.ellipse(box, fill=PAL["stone_dark"])
        d.point((box[0] + 1, box[1] + 1), fill=PAL["stone_light"])
    return img


def rock_cluster(variant: str = "plain") -> Image.Image:
    img = canvas(48, 32)
    d = ImageDraw.Draw(img)
    dark = rgba("#25263a")
    mid = rgba("#a9a8ad")
    light = rgba("#e9e9e6")
    shade = rgba("#777684")
    moss = PAL["moss_light"]
    moss_dark = PAL["moss"]
    d.rectangle((8, 27, 43, 30), fill=PAL["shadow"])
    shapes = [
        [(5, 23), (11, 14), (19, 17), (20, 27), (9, 28)],
        [(14, 15), (21, 7), (31, 10), (33, 24), (22, 28), (14, 25)],
        [(28, 18), (38, 12), (45, 19), (42, 28), (30, 28)],
        [(2, 22), (7, 18), (13, 22), (11, 29), (4, 29)],
    ]
    if variant == "tall":
        shapes = [
            [(6, 27), (14, 8), (21, 4), (24, 28)],
            [(20, 28), (31, 2), (39, 14), (42, 29)],
            [(5, 28), (17, 19), (27, 28)],
        ]
    for pts in shapes:
        d.polygon([(x + 1, y + 2) for x, y in pts], fill=dark)
        d.polygon(pts, fill=mid)
        xs = [x for x, _ in pts]
        ys = [y for _, y in pts]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        d.polygon([(x0 + 2, y0 + 2), (x1 - 5, y0 + 4), (x0 + 5, y0 + 8)], fill=light)
        d.line((x0 + 5, y0 + 9, x1 - 4, y1 - 5), fill=shade, width=2)
    if variant == "moss":
        for box in [(3, 22, 15, 28), (22, 8, 35, 13), (32, 21, 46, 29)]:
            d.rectangle(box, fill=moss_dark)
            d.rectangle((box[0] + 1, box[1], box[2] - 2, box[1] + 2), fill=moss)
        for x, y in [(6, 18), (29, 5), (42, 18)]:
            d.rectangle((x, y, x + 1, y + 4), fill=moss)
    return img


def stone_cap() -> Image.Image:
    img = canvas(24, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((4, 11, 21, 14), fill=PAL["shadow"])
    d.ellipse((3, 5, 21, 13), fill=rgba("#777684"))
    d.ellipse((5, 3, 20, 10), fill=rgba("#e9e9e6"))
    d.rectangle((7, 5, 18, 7), fill=rgba("#ffffff"))
    return img


def reed_grass(kind: str = "wheat") -> Image.Image:
    img = canvas(24, 32)
    d = ImageDraw.Draw(img)
    stem = rgba("#4f8d66")
    head = PAL["pink"] if kind == "pink" else rgba("#fff080") if kind == "yellow" else rgba("#e8d888")
    alt = rgba("#d04599") if kind == "pink" else rgba("#e8d888")
    for x, h in [(3, 27), (7, 31), (11, 24), (15, 29), (20, 22)]:
        d.rectangle((x, 31 - h, x + 1, 30), fill=stem)
        if kind == "pink":
            for y in range(31 - h + 2, 31 - h + 13, 4):
                d.rectangle((x - 2, y, x + 2, y + 2), fill=head)
        else:
            d.rectangle((x - 1, 31 - h, x + 2, 31 - h + 8), fill=head)
            d.point((x + 2, 31 - h + 2), fill=alt)
    d.rectangle((1, 29, 23, 31), fill=PAL["grass_dark"])
    return img


def wildflower_patch(kind: str = "mixed") -> Image.Image:
    img = canvas(24, 24)
    d = ImageDraw.Draw(img)
    colors = {
        "mixed": [PAL["pink"], PAL["gold_light"], PAL["white"]],
        "pink": [PAL["pink"], rgba("#d04599"), PAL["white"]],
        "yellow": [PAL["gold_light"], rgba("#fff080"), PAL["white"]],
    }[kind]
    for x, h, c in [(4, 11, colors[0]), (8, 15, colors[1]), (13, 9, colors[2]), (18, 13, colors[0])]:
        d.rectangle((x, 21 - h, x + 1, 21), fill=PAL["leaf_mid"])
        d.rectangle((x - 2, 20 - h, x + 2, 22 - h), fill=c)
        d.point((x, 21 - h), fill=PAL["gold_dark"])
    d.rectangle((1, 20, 22, 23), fill=PAL["grass_dark"])
    return img


def crystal_spikes() -> Image.Image:
    img = canvas(24, 24)
    d = ImageDraw.Draw(img)
    for x, h in [(3, 13), (9, 20), (16, 15)]:
        d.polygon([(x, 22), (x + 3, 22 - h), (x + 7, 22)], fill=PAL["cyan_dark"])
        d.polygon([(x + 2, 21), (x + 4, 23 - h), (x + 6, 21)], fill=PAL["cyan"])
        d.line((x + 4, 22 - h, x + 4, 20), fill=PAL["cyan_light"])
    return img


def icicle() -> Image.Image:
    img = canvas(16, 32)
    d = ImageDraw.Draw(img)
    d.rectangle((2, 0, 14, 4), fill=PAL["snow"])
    d.polygon([(4, 3), (8, 31), (12, 3)], fill=PAL["cyan_dark"])
    d.polygon([(5, 3), (8, 28), (10, 3)], fill=PAL["snow"])
    d.line((9, 5, 8, 24), fill=PAL["cyan_light"], width=1)
    return img


def rolling_boulder() -> Image.Image:
    img = canvas(32, 32)
    d = ImageDraw.Draw(img)
    d.ellipse((2, 4, 29, 30), fill=PAL["stone_deep"])
    d.ellipse((4, 3, 28, 27), fill=rgba("#9a9aa4"))
    for box in [(7, 8, 15, 13), (16, 6, 24, 12), (9, 18, 19, 24), (20, 18, 26, 23)]:
        d.rectangle(box, fill=rgba("#d8d8dc"))
    d.line((8, 14, 24, 23), fill=rgba("#6f7080"), width=2)
    return img


def lightning_bolt() -> Image.Image:
    img = canvas(24, 40)
    d = ImageDraw.Draw(img)
    d.polygon([(13, 0), (4, 20), (12, 18), (8, 39), (21, 13), (13, 15)], fill=PAL["white"])
    d.polygon([(13, 3), (7, 18), (15, 16), (11, 33), (19, 14), (12, 16)], fill=PAL["gold_light"])
    return img


def wind_ribbon() -> Image.Image:
    img = canvas(64, 24)
    d = ImageDraw.Draw(img)
    for y, a in [(5, 110), (11, 150), (17, 95)]:
        d.line((0, y, 18, y - 4, 38, y + 2, 63, y - 2), fill=rgba("#d8f6ff", a), width=2)
    for x, y in [(12, 4), (44, 12), (55, 18)]:
        d.rectangle((x, y, x + 2, y + 2), fill=PAL["snow"])
    return img


def jump_pad() -> Image.Image:
    img = canvas(32, 32)
    d = ImageDraw.Draw(img)
    d.rectangle((5, 18, 27, 29), fill=PAL["stone_deep"])
    d.rectangle((7, 16, 25, 27), fill=rgba("#4c5e78"))
    d.rectangle((9, 12, 23, 18), fill=PAL["stone_light"])
    d.polygon([(16, 5), (24, 14), (16, 22), (8, 14)], fill=PAL["cyan_dark"])
    d.polygon([(16, 7), (22, 14), (16, 20), (10, 14)], fill=PAL["cyan"])
    d.rectangle((12, 25, 20, 26), fill=PAL["cyan_light"])
    return img


def climbing_chain() -> Image.Image:
    img = canvas(16, 48)
    d = ImageDraw.Draw(img)
    for y in range(0, 48, 8):
        d.ellipse((4, y, 12, y + 10), outline=rgba("#9ca8b4"), width=2)
        d.point((5, y + 2), fill=PAL["orange"])
    for y in (6, 22, 38):
        d.rectangle((3, y, 5, y + 2), fill=PAL["cyan_light"])
    return img


def magic_orb(color: tuple[int, int, int, int]) -> Image.Image:
    img = canvas(20, 20)
    d = ImageDraw.Draw(img)
    d.ellipse((2, 2, 17, 17), fill=color[:3] + (82,))
    d.ellipse((5, 5, 14, 14), fill=color)
    d.rectangle((8, 3, 11, 5), fill=PAL["white"])
    return img


def thorn_vine() -> Image.Image:
    img = canvas(32, 16)
    d = ImageDraw.Draw(img)
    d.line((1, 10, 31, 6), fill=PAL["leaf_dark"], width=3)
    for x in range(4, 30, 6):
        d.polygon([(x, 8), (x + 2, 2), (x + 4, 8)], fill=PAL["red"])
    return img


def relic_shrine() -> Image.Image:
    img = canvas(48, 48)
    d = ImageDraw.Draw(img)
    d.rectangle((5, 36, 43, 44), fill=PAL["stone_deep"])
    d.rectangle((9, 29, 39, 37), fill=rgba("#b8c5d4"))
    d.rectangle((13, 21, 35, 30), fill=PAL["stone_light"])
    d.polygon([(24, 3), (34, 15), (24, 27), (14, 15)], fill=PAL["cyan_dark"])
    d.polygon([(24, 5), (31, 15), (24, 24), (17, 15)], fill=PAL["cyan"])
    d.ellipse((10, 12, 38, 34), outline=PAL["cyan_light"], width=1)
    for x in (14, 24, 34):
        d.rectangle((x, 33, x + 2, 36), fill=PAL["gold_light"])
    return img


def ancient_beacon() -> Image.Image:
    img = canvas(40, 80)
    d = ImageDraw.Draw(img)
    d.rectangle((13, 24, 27, 74), fill=PAL["stone_deep"])
    d.rectangle((15, 26, 25, 72), fill=rgba("#b8c5d4"))
    d.rectangle((9, 70, 31, 78), fill=PAL["stone_deep"])
    d.rectangle((8, 18, 32, 26), fill=PAL["stone_light"])
    d.polygon([(20, 0), (30, 15), (20, 25), (10, 15)], fill=PAL["cyan_dark"])
    d.polygon([(20, 3), (27, 15), (20, 23), (13, 15)], fill=PAL["cyan_light"])
    d.rectangle((18, 35, 22, 38), fill=PAL["gold_light"])
    d.rectangle((17, 50, 23, 52), fill=PAL["cyan"])
    return img


def enemy(kind: str) -> Image.Image:
    img = canvas(32, 32)
    d = ImageDraw.Draw(img)
    draw_shadow(d, 7, 28, 18)
    if kind == "ice_bat":
        d.polygon([(2, 14), (12, 7), (16, 15), (20, 7), (30, 14), (22, 21), (16, 18), (10, 21)], fill=PAL["outline"])
        d.polygon([(4, 14), (12, 9), (16, 16), (20, 9), (28, 14), (21, 19), (16, 17), (11, 19)], fill=rgba("#8fb1d4"))
        d.rectangle((14, 13, 18, 18), fill=PAL["cyan_light"])
    elif kind == "skeleton":
        d.rectangle((11, 5, 21, 15), fill=PAL["white"])
        d.rectangle((13, 16, 19, 25), fill=PAL["white"])
        d.rectangle((9, 25, 14, 29), fill=PAL["white"])
        d.rectangle((18, 25, 23, 29), fill=PAL["white"])
        d.rectangle((13, 9, 15, 11), fill=PAL["ink"])
        d.rectangle((18, 9, 20, 11), fill=PAL["ink"])
    elif kind == "yeti":
        d.rectangle((7, 10, 25, 27), fill=PAL["outline"])
        d.rectangle((8, 8, 24, 26), fill=PAL["snow"])
        d.rectangle((11, 5, 21, 13), fill=PAL["snow_shadow"])
        d.rectangle((12, 11, 14, 13), fill=PAL["ink"])
        d.rectangle((19, 11, 21, 13), fill=PAL["ink"])
    elif kind == "wind_spirit":
        d.ellipse((8, 5, 24, 22), fill=rgba("#d8f6ff", 185))
        d.rectangle((13, 11, 15, 13), fill=PAL["cyan_dark"])
        d.rectangle((19, 11, 21, 13), fill=PAL["cyan_dark"])
        d.line((5, 22, 24, 18, 30, 21), fill=PAL["cyan_light"], width=2)
    elif kind == "archer":
        d.rectangle((10, 10, 22, 25), fill=PAL["outline"])
        d.rectangle((12, 12, 20, 24), fill=rgba("#365a3f"))
        d.rectangle((11, 6, 21, 13), fill=PAL["skin"])
        d.arc((20, 8, 30, 26), 260, 95, fill=PAL["bark"], width=2)
        d.line((25, 9, 25, 25), fill=PAL["gold_light"], width=1)
    else:
        d.rectangle((9, 10, 23, 26), fill=PAL["outline"])
        d.rectangle((11, 12, 21, 25), fill=rgba("#6d8c47"))
        d.rectangle((10, 6, 22, 14), fill=rgba("#87a65a"))
        d.rectangle((12, 9, 14, 11), fill=PAL["ink"])
        d.rectangle((19, 9, 21, 11), fill=PAL["ink"])
        d.polygon([(10, 7), (6, 3), (12, 9)], fill=rgba("#87a65a"))
        d.polygon([(22, 7), (26, 3), (20, 9)], fill=rgba("#87a65a"))
    return img


def torch() -> Image.Image:
    img = canvas(16, 32)
    d = ImageDraw.Draw(img)
    d.rectangle((7, 13, 9, 31), fill=PAL["bark_dark"])
    d.rectangle((5, 9, 11, 15), fill=PAL["bark"])
    d.polygon([(8, 0), (13, 9), (8, 14), (3, 9)], fill=PAL["orange"])
    d.polygon([(8, 3), (11, 9), (8, 12), (5, 9)], fill=PAL["gold_light"])
    return img


def gate() -> Image.Image:
    img = canvas(48, 48)
    d = ImageDraw.Draw(img)
    d.rectangle((5, 14, 12, 46), fill=PAL["stone_deep"])
    d.rectangle((36, 14, 43, 46), fill=PAL["stone_deep"])
    d.rectangle((8, 8, 40, 15), fill=PAL["stone_dark"])
    d.rectangle((14, 19, 34, 46), fill=PAL["bark_dark"])
    for x in (17, 23, 29):
        d.rectangle((x, 20, x + 2, 46), fill=PAL["bark"])
    d.rectangle((15, 30, 33, 32), fill=PAL["gold_dark"])
    return img


def ladder() -> Image.Image:
    img = canvas(16, 48)
    d = ImageDraw.Draw(img)
    d.rectangle((3, 0, 5, 47), fill=PAL["bark_dark"])
    d.rectangle((11, 0, 13, 47), fill=PAL["bark_dark"])
    for y in range(5, 44, 8):
        d.rectangle((3, y, 13, y + 2), fill=PAL["bark"])
    return img


def banner(color: tuple[int, int, int, int]) -> Image.Image:
    img = canvas(24, 40)
    d = ImageDraw.Draw(img)
    d.rectangle((4, 2, 20, 5), fill=PAL["bark_dark"])
    d.rectangle((7, 5, 17, 31), fill=PAL["outline"])
    d.polygon([(8, 6), (16, 6), (16, 30), (12, 26), (8, 30)], fill=color)
    d.rectangle((11, 10, 13, 22), fill=PAL["gold_light"])
    d.rectangle((9, 14, 15, 16), fill=PAL["gold_light"])
    return img


def rune_stone() -> Image.Image:
    img = canvas(16, 24)
    d = ImageDraw.Draw(img)
    d.rectangle((3, 4, 13, 22), fill=PAL["stone_deep"])
    d.rectangle((4, 3, 12, 21), fill=PAL["stone_cool"])
    d.rectangle((7, 8, 9, 16), fill=PAL["cyan"])
    d.rectangle((5, 12, 11, 13), fill=PAL["cyan_light"])
    return img


def crystal_marker() -> Image.Image:
    img = canvas(16, 24)
    d = ImageDraw.Draw(img)
    d.polygon([(8, 1), (14, 9), (10, 22), (5, 22), (2, 9)], fill=PAL["cyan_dark"])
    d.polygon([(8, 2), (13, 9), (9, 21), (6, 21), (3, 9)], fill=PAL["cyan"])
    d.rectangle((6, 5, 9, 8), fill=PAL["cyan_light"])
    return img


def fog() -> Image.Image:
    img = canvas(256, 64)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 28, 90, 38), fill=rgba("#d8fff0", 42))
    d.rectangle((76, 22, 178, 35), fill=rgba("#ffffff", 36))
    d.rectangle((150, 34, 255, 47), fill=rgba("#a0f0ff", 32))
    d.rectangle((12, 48, 230, 55), fill=rgba("#ffffff", 24))
    return img


def relic(frame: int = 0) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    c = [PAL["pink"], PAL["violet"], PAL["red"], PAL["gold_light"]][frame % 4]
    d.rectangle((5, 2, 11, 13), fill=PAL["outline"])
    d.rectangle((6, 3, 10, 12), fill=c)
    d.rectangle((4, 11, 12, 14), fill=PAL["gold_dark"])
    d.point((8, 5), fill=PAL["white"])
    return img


def heart() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((3, 4, 6, 8), fill=PAL["outline"])
    d.rectangle((10, 4, 13, 8), fill=PAL["outline"])
    d.polygon([(2, 7), (14, 7), (8, 15)], fill=PAL["outline"])
    d.rectangle((4, 5, 6, 8), fill=PAL["red"])
    d.rectangle((10, 5, 12, 8), fill=PAL["red"])
    d.polygon([(3, 8), (13, 8), (8, 14)], fill=PAL["red"])
    d.point((5, 6), fill=PAL["white"])
    return img


def potion() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((6, 1, 10, 4), fill=PAL["stone_light"])
    d.rectangle((5, 4, 11, 13), fill=PAL["outline"])
    d.rectangle((6, 5, 10, 12), fill=PAL["cyan"])
    d.rectangle((7, 5, 9, 7), fill=PAL["cyan_light"])
    return img


def exp_badge() -> Image.Image:
    img = canvas(24, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((1, 3, 22, 13), fill=PAL["outline"])
    d.rectangle((3, 4, 20, 12), fill=PAL["gold_dark"])
    d.rectangle((5, 6, 18, 9), fill=PAL["gold_light"])
    return img


def treasure_chest() -> Image.Image:
    img = canvas(32, 24)
    d = ImageDraw.Draw(img)
    d.rectangle((3, 8, 29, 22), fill=PAL["outline"])
    d.rectangle((5, 10, 27, 20), fill=PAL["bark"])
    d.rectangle((6, 6, 26, 12), fill=PAL["gold_dark"])
    d.rectangle((7, 7, 25, 10), fill=PAL["gold"])
    d.rectangle((14, 10, 18, 17), fill=PAL["gold_light"])
    return img


def tile_assets() -> dict[str, Image.Image]:
    return {
        "stone_snow_top": platform(16, 16, "snow").crop((0, 0, 16, 16)),
        "stone_grass_top": platform(16, 16, "moss").crop((0, 0, 16, 16)),
        "stone_cracked": platform(16, 16, "cracked").crop((0, 0, 16, 16)),
        "stone_rune": platform(16, 16, "runes").crop((0, 0, 16, 16)),
        "stone_solid": solid_tile(),
        "hazard_spikes": spikes(),
        "ladder_tile": ladder().crop((0, 0, 16, 16)),
        "wood_plank": wood_tile(),
    }


def solid_tile() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 15, 15), fill=PAL["stone_deep"])
    d.rectangle((1, 1, 14, 14), fill=PAL["stone_dark"])
    d.rectangle((2, 2, 13, 3), fill=PAL["stone_mid"])
    d.rectangle((3, 8, 12, 9), fill=PAL["outline"])
    return img


def wood_tile() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 3, 15, 12), fill=PAL["bark_dark"])
    d.rectangle((1, 4, 14, 11), fill=PAL["bark"])
    d.rectangle((2, 5, 12, 6), fill=PAL["stone_light"])
    d.rectangle((7, 4, 8, 11), fill=PAL["bark_dark"])
    return img


def write_manifest(manifest: dict[str, dict]) -> None:
    payload = {
        "generatedBy": "tools/generate-separated-assets.py",
        "rule": "Every gameplay asset is exported as an individual transparent PNG; no sprite atlases or tilemap sheets are generated.",
        "style": "2D pixel art, nearest-neighbor, transparent backgrounds for gameplay sprites.",
        "assets": dict(sorted(manifest.items())),
    }
    (OUT / "manifest.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    clean()
    manifest: dict[str, dict] = {}
    generate_characters(manifest)
    generate_environment(manifest)
    write_manifest(manifest)
    print(f"Generated {len(manifest)} separate PNG assets under {OUT}")


if __name__ == "__main__":
    main()
