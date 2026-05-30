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
    "ink": (12, 13, 18, 255),
    "outline": (5, 7, 11, 255),
    "shadow": (0, 0, 0, 110),
    "skin": (226, 178, 118, 255),
    "skin_shadow": (142, 86, 60, 255),
    "hair": (27, 18, 12, 255),
    "scarf": (178, 44, 34, 255),
    "scarf_dark": (82, 19, 25, 255),
    "gold": (214, 157, 42, 255),
    "gold_dark": (118, 73, 28, 255),
    "gold_light": (255, 218, 84, 255),
    "stone_deep": (20, 22, 28, 255),
    "stone_dark": (43, 48, 55, 255),
    "stone_mid": (84, 90, 91, 255),
    "stone_light": (155, 159, 146, 255),
    "stone_cool": (73, 83, 88, 255),
    "soil": (77, 52, 33, 255),
    "soil_dark": (29, 23, 18, 255),
    "grass": (105, 144, 61, 255),
    "grass_dark": (40, 77, 37, 255),
    "moss": (61, 107, 47, 255),
    "moss_light": (133, 174, 76, 255),
    "leaf_dark": (18, 45, 30, 255),
    "leaf_mid": (40, 86, 52, 255),
    "leaf_light": (111, 166, 70, 255),
    "bark": (86, 56, 33, 255),
    "bark_dark": (35, 25, 18, 255),
    "snow": (222, 234, 242, 255),
    "snow_shadow": (121, 152, 172, 255),
    "cyan": (54, 224, 232, 255),
    "cyan_light": (174, 255, 245, 255),
    "cyan_dark": (14, 71, 79, 255),
    "red": (221, 47, 43, 255),
    "orange": (255, 120, 48, 255),
    "pink": (214, 74, 162, 255),
    "violet": (177, 79, 255, 255),
    "blue": (45, 114, 203, 255),
    "green": (74, 245, 135, 255),
    "white": (246, 247, 226, 255),
    "cloud": (211, 224, 231, 220),
    "cloud_mid": (134, 164, 184, 210),
    "cloud_shadow": (62, 91, 126, 190),
}


def rgba(hex_rgb: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_rgb = hex_rgb.removeprefix("#")
    return (int(hex_rgb[0:2], 16), int(hex_rgb[2:4], 16), int(hex_rgb[4:6], 16), alpha)


def clamp_channel(value: int) -> int:
    return max(0, min(255, value))


def stable_hash(text: str) -> int:
    value = 2166136261
    for ch in text:
        value ^= ord(ch)
        value = (value * 16777619) & 0xFFFFFFFF
    return value


def noita_polish(img: Image.Image, rel: str) -> Image.Image:
    """Add gritty high-contrast pixel clustering without changing transparency."""
    out = img.copy()
    px = out.load()
    seed = stable_hash(rel)
    is_mid_mountain = "/midMountains/" in rel
    is_reward = "/collectibles/" in rel or "/ui/" in rel
    is_effect = "/effects/" in rel or "/particleEffects/" in rel
    is_background = "/backgrounds/" in rel or "/mountainBackgrounds/" in rel or "/clouds/" in rel
    if is_mid_mountain:
        # The back mountain layer must read as one quiet mass. Avoid the
        # crunchy high-contrast speckle pass used by foreground props.
        for y in range(out.height):
            for x in range(out.width):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                avg = (r + g + b) // 3
                r = clamp_channel(int(avg * 0.35 + r * 0.65))
                g = clamp_channel(int(avg * 0.35 + g * 0.65))
                b = clamp_channel(int(avg * 0.35 + b * 0.65))
                step = 9
                px[x, y] = ((r // step) * step, (g // step) * step, (b // step) * step, a)
        return out
    brightness = 0.78 if is_mid_mountain else 0.74 if is_background else 0.88 if not (is_reward or is_effect) else 1.0
    grain_scale = 0.85 if is_mid_mountain else 1.35 if not is_reward else 0.55
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            emissive = (
                (g > 185 and b > 165 and r < 130) or
                (r > 190 and g > 125 and b < 95) or
                (r > 150 and b > 180 and g < 125) or
                (r > 215 and g > 205 and b > 165)
            )
            grain = int((((x * 17 + y * 31 + seed) % 9) - 4) * grain_scale)
            if (x * 11 + y * 7 + seed) % 23 == 0:
                grain += 14 if is_reward else 20
            elif (x * 5 + y * 13 + seed) % 19 == 0:
                grain -= 12 if is_reward else 24

            saturation_bias = 1.18 if emissive else 1.03 if max(r, g, b) - min(r, g, b) > 38 else 0.88
            avg = (r + g + b) // 3
            shade = 1.0 if emissive else brightness
            r = clamp_channel(int((avg + (r - avg) * saturation_bias) * shade) + grain)
            g = clamp_channel(int((avg + (g - avg) * saturation_bias) * shade) + grain)
            b = clamp_channel(int((avg + (b - avg) * saturation_bias) * shade) + grain)
            if not emissive and not is_reward:
                step = 13 if is_background else 17
                r = (r // step) * step
                g = (g // step) * step
                b = (b // step) * step
            if not (is_reward or is_effect) and (x * 29 + y * 37 + seed) % 97 == 0:
                r, g, b = max(0, r - 42), max(0, g - 42), max(0, b - 42)
            px[x, y] = (r, g, b, a)
    return out


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
    img = noita_polish(img, rel)
    img.save(path)
    manifest[rel] = {"png": f"/assets/{rel}", "width": img.width, "height": img.height}


def draw_shadow(d: ImageDraw.ImageDraw, x: int, y: int, w: int) -> None:
    d.ellipse((x, y, x + w, y + max(2, w // 5)), fill=PAL["shadow"])


def draw_character(kind: str, pose: str, frame: int, palette: dict[str, tuple[int, int, int, int]]) -> Image.Image:
    img = canvas(40, 56)
    d = ImageDraw.Draw(img)

    if pose == "lying_dead":
        draw_shadow(d, 7, 50, 26)
        d.rectangle((6, 39, 31, 48), fill=PAL["outline"])
        d.rectangle((8, 38, 29, 46), fill=palette["jacket_dark"])
        d.rectangle((11, 38, 25, 45), fill=palette["jacket"])
        d.rectangle((24, 31, 35, 40), fill=PAL["outline"])
        d.rectangle((25, 32, 34, 39), fill=palette["skin"])
        if kind in {"rogue", "hunter"}:
            d.rectangle((24, 30, 35, 35), fill=palette["hood"])
        else:
            d.rectangle((24, 30, 35, 34), fill=palette["hair"])
        d.rectangle((9, 46, 15, 52), fill=palette["boots"])
        d.rectangle((23, 46, 30, 52), fill=palette["boots"])
        d.rectangle((12, 35, 27, 37), fill=palette["accent"])
        if kind == "mage":
            d.rectangle((3, 32, 5, 50), fill=palette["weapon"])
            d.rectangle((1, 30, 7, 35), fill=PAL["cyan"])
        if frame % 2 == 0:
            d.rectangle((34, 34, 35, 35), fill=PAL["ink"])
        return img

    bob = [0, -1, 0, 1][frame % 4] if pose == "idle" else 0
    if pose in {"jumping", "shooting"}:
        bob -= 3
    if pose == "falling":
        bob += 2

    lean = 2 if pose == "running" else -1 if pose == "shooting" else 0
    body_x = 14 + lean
    body_y = 20 + bob
    head_x = 13 + lean
    head_y = 7 + bob
    face_x = head_x + 1

    if pose in {"walking", "running"}:
        swing = [-3, -1, 2, 3, 1, -2][frame % 6]
    elif pose == "jumping":
        swing = -2
    elif pose == "falling":
        swing = 2
    else:
        swing = 0

    draw_shadow(d, 9, 51, 22)

    scarf_len = 7
    if pose == "running":
        scarf_len = 12 + (frame % 2) * 2
    if pose in {"jumping", "falling", "shooting"}:
        scarf_len = 12
    cloak_sway = 2 if pose == "running" and frame % 2 else -1 if pose in {"jumping", "falling"} else 0
    d.polygon(
        [
            (body_x - 5, body_y + 2),
            (body_x + 8, body_y + 1),
            (body_x + 13 + cloak_sway, body_y + 28),
            (body_x + 3, body_y + 35),
            (body_x - 9 - abs(cloak_sway), body_y + 28),
        ],
        fill=PAL["outline"],
    )
    d.polygon(
        [
            (body_x - 3, body_y + 3),
            (body_x + 7, body_y + 3),
            (body_x + 10 + cloak_sway, body_y + 27),
            (body_x + 3, body_y + 32),
            (body_x - 7 - abs(cloak_sway), body_y + 27),
        ],
        fill=palette["jacket_dark"],
    )
    d.rectangle((body_x - scarf_len, body_y + 6, body_x + 3, body_y + 8), fill=palette["scarf"])
    d.rectangle((body_x - scarf_len - 3, body_y + 9, body_x - 2, body_y + 10), fill=palette["scarf_dark"])

    if kind == "warrior":
        for ox, oy in ((1, -4), (-3, -2), (8, -3), (12, 0)):
            d.rectangle((head_x + ox, head_y + oy, head_x + ox + 4, head_y + oy + 4), fill=PAL["outline"])
            d.rectangle((head_x + ox + 1, head_y + oy, head_x + ox + 3, head_y + oy + 3), fill=palette["hair"])
        d.rectangle((head_x - 2, head_y + 1, head_x + 14, head_y + 5), fill=PAL["outline"])
        d.rectangle((head_x, head_y, head_x + 12, head_y + 3), fill=palette["hair"])
    elif kind == "rogue":
        d.polygon([(head_x - 3, head_y + 4), (head_x + 6, head_y - 2), (head_x + 15, head_y + 4), (head_x + 13, head_y + 13), (head_x - 1, head_y + 13)], fill=PAL["outline"])
        d.polygon([(head_x - 1, head_y + 4), (head_x + 6, head_y), (head_x + 13, head_y + 4), (head_x + 11, head_y + 11), (head_x + 1, head_y + 11)], fill=palette["hood"])
    elif kind == "mage":
        d.polygon([(head_x - 3, head_y + 1), (head_x + 6, head_y - 8), (head_x + 15, head_y + 2)], fill=PAL["outline"])
        d.polygon([(head_x - 1, head_y), (head_x + 6, head_y - 7), (head_x + 13, head_y + 1)], fill=palette["hat"])
        d.rectangle((head_x - 2, head_y + 2, head_x + 16, head_y + 4), fill=PAL["outline"])
        d.rectangle((head_x, head_y + 1, head_x + 14, head_y + 3), fill=palette["hat"])
        d.rectangle((head_x + 3, head_y + 2, head_x + 13, head_y + 3), fill=palette["hat_band"])
    elif kind == "hunter":
        d.polygon([(head_x - 3, head_y + 2), (head_x + 6, head_y - 4), (head_x + 16, head_y + 2), (head_x + 14, head_y + 6), (head_x - 2, head_y + 6)], fill=PAL["outline"])
        d.polygon([(head_x - 1, head_y + 2), (head_x + 6, head_y - 3), (head_x + 14, head_y + 2), (head_x + 12, head_y + 5), (head_x, head_y + 5)], fill=palette["hood"])

    d.rectangle((face_x - 1, head_y + 4, face_x + 11, head_y + 14), fill=PAL["outline"])
    d.rectangle((face_x, head_y + 5, face_x + 10, head_y + 13), fill=palette["skin"])
    if kind not in {"rogue", "hunter"}:
        d.rectangle((face_x, head_y + 5, face_x + 10, head_y + 6), fill=palette["hair"])
        d.rectangle((face_x - 3, head_y + 6, face_x, head_y + 17 + abs(cloak_sway)), fill=PAL["outline"])
        d.rectangle((face_x - 2, head_y + 6, face_x - 1, head_y + 16 + abs(cloak_sway)), fill=palette["hair"])
    d.rectangle((face_x + 7, head_y + 8, face_x + 9, head_y + 10), fill=PAL["ink"])
    d.point((face_x + 9, head_y + 8), fill=PAL["white"])
    d.rectangle((face_x + 2, head_y + 13, face_x + 8, head_y + 15), fill=palette["skin_shadow"])

    d.rectangle((body_x - 2, body_y - 1, body_x + 13, body_y + 25), fill=PAL["outline"])
    d.rectangle((body_x, body_y, body_x + 11, body_y + 24), fill=palette["jacket_dark"])
    d.rectangle((body_x + 2, body_y + 2, body_x + 9, body_y + 21), fill=palette["jacket"])
    d.rectangle((body_x + 5, body_y + 1, body_x + 6, body_y + 22), fill=palette["belt"])
    d.rectangle((body_x + 1, body_y + 12, body_x + 11, body_y + 14), fill=palette["belt"])
    if kind == "warrior":
        d.rectangle((body_x + 2, body_y + 3, body_x + 10, body_y + 5), fill=palette["accent"])
    if kind == "mage":
        d.rectangle((body_x + 3, body_y + 5, body_x + 9, body_y + 6), fill=PAL["cyan_light"])
        d.rectangle((body_x + 6, body_y + 3, body_x + 6, body_y + 16), fill=PAL["cyan"])

    front_step = max(0, swing)
    back_step = max(0, -swing)
    d.rectangle((body_x + 1, body_y + 24 + front_step, body_x + 5, body_y + 38 + front_step), fill=PAL["outline"])
    d.rectangle((body_x + 2, body_y + 25 + front_step, body_x + 4, body_y + 37 + front_step), fill=palette["boots"])
    d.rectangle((body_x + 8, body_y + 24 + back_step, body_x + 12, body_y + 38 + back_step), fill=PAL["outline"])
    d.rectangle((body_x + 9, body_y + 25 + back_step, body_x + 11, body_y + 37 + back_step), fill=palette["boots"])
    d.rectangle((body_x + 1, body_y + 37 + front_step, body_x + 8, body_y + 40 + front_step), fill=PAL["outline"])
    d.rectangle((body_x + 8, body_y + 37 + back_step, body_x + 15, body_y + 40 + back_step), fill=PAL["outline"])

    arm_y = body_y + 6
    arm_swing = -swing if pose in {"walking", "running"} else 0
    if pose == "shooting":
        d.rectangle((body_x + 11, arm_y, body_x + 24, arm_y + 4), fill=PAL["outline"])
        d.rectangle((body_x + 12, arm_y + 1, body_x + 23, arm_y + 3), fill=palette["skin"])
    else:
        d.rectangle((body_x - 6, arm_y + max(0, arm_swing), body_x + 1, arm_y + 4 + max(0, arm_swing)), fill=PAL["outline"])
        d.rectangle((body_x - 5, arm_y + 1 + max(0, arm_swing), body_x, arm_y + 3 + max(0, arm_swing)), fill=palette["skin"])
        d.rectangle((body_x + 11, arm_y + max(0, -arm_swing), body_x + 17, arm_y + 4 + max(0, -arm_swing)), fill=PAL["outline"])
        d.rectangle((body_x + 12, arm_y + 1 + max(0, -arm_swing), body_x + 16, arm_y + 3 + max(0, -arm_swing)), fill=palette["skin"])

    if kind == "warrior":
        shield_y = arm_y + (1 if pose == "falling" else 0)
        d.ellipse((body_x - 9, shield_y - 3, body_x - 1, shield_y + 8), fill=PAL["outline"])
        d.ellipse((body_x - 8, shield_y - 2, body_x - 2, shield_y + 7), fill=rgba("#7f9ebf"))
        d.rectangle((body_x - 6, shield_y, body_x - 4, shield_y + 5), fill=palette["accent"])
        sx = body_x + 19
        sy = arm_y + (3 if pose != "shooting" else 0)
        d.rectangle((sx, sy - 7, sx + 2, sy + 7), fill=PAL["outline"])
        d.rectangle((sx + 1, sy - 7, sx + 1, sy + 6), fill=palette["weapon"])
        d.rectangle((sx - 2, sy + 4, sx + 5, sy + 5), fill=palette["accent"])
    elif kind == "rogue":
        blade_y = arm_y + (2 if pose != "shooting" else 0)
        d.line((body_x + 15, blade_y + 2, body_x + 28, blade_y - 3), fill=PAL["outline"], width=3)
        d.line((body_x + 16, blade_y + 1, body_x + 27, blade_y - 3), fill=palette["weapon"], width=1)
        d.rectangle((body_x + 13, blade_y + 1, body_x + 16, blade_y + 3), fill=palette["accent"])
    elif kind == "mage":
        staff_x = body_x + (23 if pose == "shooting" else 18)
        d.rectangle((staff_x, arm_y - 7, staff_x + 2, arm_y + 13), fill=PAL["outline"])
        d.rectangle((staff_x + 1, arm_y - 6, staff_x + 1, arm_y + 12), fill=palette["weapon"])
        orb_x = staff_x + 1 + (frame % 2 if pose == "shooting" else 0)
        d.rectangle((orb_x - 3, arm_y - 10, orb_x + 3, arm_y - 4), fill=PAL["cyan"])
        d.rectangle((orb_x - 1, arm_y - 12, orb_x + 1, arm_y - 2), fill=PAL["cyan_light"])
        if pose == "shooting":
            d.rectangle((32, arm_y - 8, 37, arm_y - 3), fill=PAL["cyan"])
            d.rectangle((34, arm_y - 11, 35, arm_y), fill=PAL["cyan_light"])
    elif kind == "hunter":
        bow_x = body_x + 20
        bow_y = arm_y + 2
        d.arc((bow_x - 4, bow_y - 11, bow_x + 8, bow_y + 13), 260, 100, fill=PAL["outline"], width=3)
        d.arc((bow_x - 3, bow_y - 10, bow_x + 7, bow_y + 12), 260, 100, fill=palette["weapon"], width=1)
        d.line((bow_x + 2, bow_y - 8, bow_x + 2, bow_y + 10), fill=PAL["gold_light"], width=1)
        if pose == "shooting":
            d.rectangle((bow_x + 2, bow_y, 38, bow_y + 1), fill=PAL["gold_light"])
            d.polygon([(38, bow_y), (35, bow_y - 2), (35, bow_y + 3)], fill=PAL["gold_light"])

    if pose == "kick":
        d.rectangle((body_x + 12, body_y + 28, body_x + 31, body_y + 33), fill=PAL["outline"])
        d.rectangle((body_x + 13, body_y + 29, body_x + 28, body_y + 32), fill=palette["jacket"])
        d.rectangle((body_x + 28, body_y + 28, body_x + 36, body_y + 33), fill=palette["boots"])

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
        "character5": ("warrior", {
            "jacket": rgba("#d86f3d"), "jacket_dark": rgba("#55352a"), "belt": rgba("#2a1c16"),
            "hair": rgba("#583018"), "skin": PAL["skin"], "skin_shadow": PAL["skin_shadow"],
            "boots": rgba("#202b26"), "scarf": rgba("#48d6ff"), "scarf_dark": rgba("#1a6f91"),
            "accent": PAL["cyan_light"], "weapon": rgba("#e9f2ff"), "hood": rgba("#6a4820"),
            "hat": rgba("#d86f3d"), "hat_band": rgba("#55352a"),
        }),
        "character6": ("rogue", {
            "jacket": rgba("#463b65"), "jacket_dark": rgba("#171322"), "belt": rgba("#d69b39"),
            "hair": rgba("#111827"), "skin": rgba("#d98d65"), "skin_shadow": rgba("#8d503d"),
            "boots": rgba("#151520"), "scarf": rgba("#c84a4a"), "scarf_dark": rgba("#6f1f2d"),
            "accent": rgba("#e2b84f"), "weapon": rgba("#d9e7f0"), "hood": rgba("#292037"),
            "hat": rgba("#292037"), "hat_band": rgba("#c84a4a"),
        }),
        "character7": ("mage", {
            "jacket": rgba("#6d5dff"), "jacket_dark": rgba("#1b2356"), "belt": rgba("#ffe870"),
            "hair": rgba("#201030"), "skin": rgba("#ffd0a0"), "skin_shadow": rgba("#c17c55"),
            "boots": rgba("#1c2540"), "scarf": rgba("#55b6ff"), "scarf_dark": rgba("#245cbb"),
            "accent": PAL["cyan_light"], "weapon": rgba("#8a5a30"), "hood": rgba("#4088d8"),
            "hat": rgba("#3146a8"), "hat_band": PAL["gold_light"],
        }),
        "character8": ("hunter", {
            "jacket": rgba("#7d9a5b"), "jacket_dark": rgba("#2a442b"), "belt": rgba("#a86b32"),
            "hair": rgba("#5a3018"), "skin": rgba("#ffc080"), "skin_shadow": rgba("#ba7048"),
            "boots": rgba("#233118"), "scarf": rgba("#55b6ff"), "scarf_dark": rgba("#245cbb"),
            "accent": rgba("#e2b84f"), "weapon": rgba("#8a5a30"), "hood": rgba("#4f6f3f"),
            "hat": rgba("#4f6f3f"), "hat_band": rgba("#e2b84f"),
        }),
    }


def grim_character_palette(palette: dict[str, tuple[int, int, int, int]]) -> dict[str, tuple[int, int, int, int]]:
    keep_bright = {"accent", "scarf", "weapon", "hat_band"}
    adjusted: dict[str, tuple[int, int, int, int]] = {}
    for name, color in palette.items():
        r, g, b, a = color
        if name in keep_bright:
            adjusted[name] = (
                clamp_channel(int(r * 0.88 + 18)),
                clamp_channel(int(g * 0.88 + 14)),
                clamp_channel(int(b * 0.88 + 10)),
                a,
            )
        elif name in {"skin", "skin_shadow"}:
            adjusted[name] = (
                clamp_channel(int(r * 0.82)),
                clamp_channel(int(g * 0.76)),
                clamp_channel(int(b * 0.70)),
                a,
            )
        else:
            adjusted[name] = (
                clamp_channel(int(r * 0.58)),
                clamp_channel(int(g * 0.62)),
                clamp_channel(int(b * 0.68)),
                a,
            )
    return adjusted


CHARACTER_SUIT_SPECS: dict[str, dict[str, tuple[int, int, int, int] | str]] = {
    "character1": {
        "kind": "horned_cloak",
        "body": rgba("#202234"),
        "body_dark": rgba("#090b12"),
        "armor": rgba("#4f566f"),
        "trim": PAL["violet"],
        "trim_dark": rgba("#3e1686"),
        "visor": PAL["violet"],
        "glass": rgba("#ecf2ff"),
    },
    "character2": {
        "kind": "horned_knight",
        "body": rgba("#343638"),
        "body_dark": rgba("#0a0c0f"),
        "armor": rgba("#d8d4cf"),
        "trim": PAL["red"],
        "trim_dark": rgba("#811421"),
        "visor": PAL["red"],
        "glass": rgba("#fff3ee"),
    },
    "character3": {
        "kind": "horned_cloak",
        "body": rgba("#171a18"),
        "body_dark": rgba("#030506"),
        "armor": rgba("#39433d"),
        "trim": PAL["red"],
        "trim_dark": rgba("#781828"),
        "visor": rgba("#ff2f72"),
        "glass": rgba("#cbd6d2"),
    },
    "character4": {
        "kind": "tank",
        "body": rgba("#243044"),
        "body_dark": rgba("#0a111d"),
        "armor": rgba("#2f73c8"),
        "trim": PAL["cyan"],
        "trim_dark": rgba("#174c80"),
        "visor": PAL["cyan"],
        "glass": rgba("#60b8ff"),
    },
    "character5": {
        "kind": "ninja",
        "body": rgba("#15171b"),
        "body_dark": rgba("#030406"),
        "armor": rgba("#252b32"),
        "trim": rgba("#7b0f22"),
        "trim_dark": rgba("#430814"),
        "visor": PAL["gold_light"],
        "glass": rgba("#171b20"),
    },
    "character6": {
        "kind": "tank",
        "body": rgba("#252629"),
        "body_dark": rgba("#09090b"),
        "armor": rgba("#95172f"),
        "trim": PAL["red"],
        "trim_dark": rgba("#4f0c19"),
        "visor": PAL["red"],
        "glass": rgba("#a80f2c"),
    },
    "character7": {
        "kind": "bio_mech",
        "body": rgba("#e2ded2"),
        "body_dark": rgba("#242730"),
        "armor": rgba("#c9c2b8"),
        "trim": PAL["cyan"],
        "trim_dark": rgba("#a8344d"),
        "visor": PAL["cyan_light"],
        "glass": rgba("#f2eee4"),
    },
    "character8": {
        "kind": "robot",
        "body": rgba("#2a332e"),
        "body_dark": rgba("#0c1110"),
        "armor": rgba("#58665c"),
        "trim": rgba("#a74a2f"),
        "trim_dark": rgba("#4d2119"),
        "visor": PAL["gold_light"],
        "glass": rgba("#2f3b36"),
    },
}


def draw_suit_character(spec: dict[str, tuple[int, int, int, int] | str], pose: str, frame: int) -> Image.Image:
    img = canvas(48, 56)
    d = ImageDraw.Draw(img)
    kind = str(spec["kind"])
    body = spec["body"]  # type: ignore[assignment]
    body_dark = spec["body_dark"]  # type: ignore[assignment]
    armor = spec["armor"]  # type: ignore[assignment]
    trim = spec["trim"]  # type: ignore[assignment]
    trim_dark = spec["trim_dark"]  # type: ignore[assignment]
    visor = spec["visor"]  # type: ignore[assignment]
    glass = spec["glass"]  # type: ignore[assignment]

    direction = -1 if pose.endswith("_left") else 1
    base_pose = pose.removesuffix("_left").removesuffix("_right")
    bob = [0, -1, 0, 1][frame % 4] if base_pose == "idle" else 0
    if base_pose in {"walking", "running"}:
        bob = [0, -1, 0, 1, 0, -1][frame % 6]
    if base_pose == "jumping":
        bob = -4
    if base_pose == "falling":
        bob = 3
    if base_pose == "taking_damage":
        bob = 1
    if base_pose == "lying_dead":
        draw_shadow(d, 11, 48, 28)
        d.rectangle((9, 39, 39, 49), fill=PAL["outline"])
        d.rectangle((12, 38, 36, 47), fill=body_dark)
        d.rectangle((16, 36, 29, 43), fill=armor)
        d.rectangle((30, 33, 42, 43), fill=PAL["outline"])
        d.rectangle((31, 34, 39, 41), fill=glass)
        d.rectangle((14, 47, 21, 52), fill=PAL["outline"])
        d.rectangle((29, 47, 37, 52), fill=PAL["outline"])
        d.rectangle((20, 37, 28, 38), fill=trim)
        return img

    x = 15 + (1 if base_pose in {"running", "hitting", "shooting"} else 0)
    y = 11 + bob
    swing = [-3, -1, 2, 3, 1, -2][frame % 6] if base_pose in {"walking", "running"} else 0
    attack_reach = 10 if base_pose in {"punching", "hitting", "kick", "shooting"} else 0
    hurt_shift = -2 if base_pose == "taking_damage" and frame % 2 == 0 else 0

    draw_shadow(d, 11, 50, 27)

    # Cloak / backpack silhouette.
    if kind in {"horned_cloak", "ninja"}:
        d.polygon([(x - 6, y + 15), (x + 18, y + 14), (x + 22, y + 42), (x + 12, y + 49), (x - 8, y + 40)], fill=PAL["outline"])
        d.polygon([(x - 4, y + 17), (x + 16, y + 16), (x + 18, y + 40), (x + 10, y + 45), (x - 5, y + 38)], fill=body_dark)
    elif kind == "bio_mech":
        d.line((x - 5, y + 21, x - 12, y + 39), fill=PAL["outline"], width=5)
        d.line((x - 4, y + 22, x - 10, y + 38), fill=trim_dark, width=3)
        for ox, oy in [(-13, 36), (-9, 42), (-5, 39)]:
            d.rectangle((x + ox, y + oy, x + ox + 4, y + oy + 4), fill=trim)
    elif kind == "tank":
        d.rectangle((x - 8, y + 14, x - 3, y + 39), fill=PAL["outline"])
        d.rectangle((x - 7, y + 16, x - 4, y + 37), fill=body_dark)
        d.rectangle((x - 6, y + 19, x - 4, y + 23), fill=visor)

    # Body.
    d.rectangle((x + 1 + hurt_shift, y + 22, x + 24 + hurt_shift, y + 42), fill=PAL["outline"])
    d.rectangle((x + 4 + hurt_shift, y + 23, x + 21 + hurt_shift, y + 40), fill=body)
    d.rectangle((x + 7 + hurt_shift, y + 24, x + 18 + hurt_shift, y + 31), fill=armor)
    d.rectangle((x + 4 + hurt_shift, y + 38, x + 21 + hurt_shift, y + 41), fill=body_dark)
    d.rectangle((x + 10 + hurt_shift, y + 33, x + 15 + hurt_shift, y + 34), fill=trim)

    # Legs.
    front = max(0, swing)
    back = max(0, -swing)
    if base_pose in {"jumping", "falling"}:
        front, back = 2, 0
    d.rectangle((x + 5, y + 40 + front, x + 10, y + 50 + front), fill=PAL["outline"])
    d.rectangle((x + 7, y + 41 + front, x + 9, y + 48 + front), fill=body_dark)
    d.rectangle((x + 16, y + 40 + back, x + 21, y + 50 + back), fill=PAL["outline"])
    d.rectangle((x + 17, y + 41 + back, x + 19, y + 48 + back), fill=body_dark)
    d.rectangle((x + 5, y + 49 + front, x + 12, y + 52 + front), fill=PAL["outline"])
    d.rectangle((x + 15, y + 49 + back, x + 22, y + 52 + back), fill=PAL["outline"])

    # Head and helmets.
    if kind in {"tank"}:
        d.rectangle((x + 2, y + 5, x + 25, y + 25), fill=PAL["outline"])
        d.rectangle((x + 4, y + 6, x + 23, y + 23), fill=glass)
        d.rectangle((x + 5, y + 7, x + 22, y + 9), fill=rgba("#7fe7ff") if trim == PAL["cyan"] else rgba("#ff4e6f"))
        d.rectangle((x + 7, y + 23, x + 20, y + 26), fill=trim_dark)
    elif kind in {"horned_cloak", "horned_knight"}:
        d.rectangle((x + 3, y + 8, x + 25, y + 27), fill=PAL["outline"])
        d.rectangle((x + 5, y + 9, x + 23, y + 25), fill=armor if kind == "horned_knight" else body)
        d.rectangle((x + 6, y + 18, x + 22, y + 21), fill=trim_dark)
        d.rectangle((x + 8, y + 18, x + 11, y + 20), fill=visor)
        d.rectangle((x + 18, y + 18, x + 21, y + 20), fill=visor)
        for side in (-1, 1):
            hx = x + (4 if side < 0 else 22)
            d.line((hx, y + 9, hx + side * 6, y - 3), fill=PAL["outline"], width=5)
            d.line((hx, y + 8, hx + side * 5, y - 2), fill=trim, width=3)
            d.point((hx + side * 3, y + 1), fill=PAL["white"])
    elif kind == "bio_mech":
        d.rectangle((x + 1, y + 9, x + 25, y + 31), fill=PAL["outline"])
        d.rectangle((x + 4, y + 10, x + 22, y + 28), fill=glass)
        d.rectangle((x + 6, y + 25, x + 20, y + 28), fill=trim_dark)
        d.rectangle((x + 4, y + 4, x + 8, y + 11), fill=PAL["outline"])
        d.rectangle((x + 17, y + 3, x + 22, y + 11), fill=PAL["outline"])
        d.rectangle((x + 5, y + 5, x + 7, y + 10), fill=trim)
        d.rectangle((x + 18, y + 4, x + 21, y + 10), fill=trim)
    else:
        d.rectangle((x + 4, y + 11, x + 25, y + 29), fill=PAL["outline"])
        d.rectangle((x + 6, y + 12, x + 23, y + 27), fill=body_dark if kind == "ninja" else armor)
        d.rectangle((x + 9, y + 18, x + 21, y + 22), fill=trim_dark)
        d.rectangle((x + 11, y + 18, x + 14, y + 21), fill=visor)
        d.rectangle((x + 18, y + 18, x + 21, y + 21), fill=visor)

    # Arms / attacks.
    arm_y = y + 27
    left_arm_x = x - 4
    right_arm_x = x + 22 + attack_reach
    d.rectangle((left_arm_x, arm_y + max(0, swing), left_arm_x + 8, arm_y + 5 + max(0, swing)), fill=PAL["outline"])
    d.rectangle((left_arm_x + 1, arm_y + 1 + max(0, swing), left_arm_x + 7, arm_y + 4 + max(0, swing)), fill=armor)
    d.rectangle((x + 20, arm_y + max(0, -swing), right_arm_x + 5, arm_y + 5 + max(0, -swing)), fill=PAL["outline"])
    d.rectangle((x + 21, arm_y + 1 + max(0, -swing), right_arm_x + 4, arm_y + 4 + max(0, -swing)), fill=armor)
    if base_pose in {"hitting", "shooting"}:
        d.rectangle((right_arm_x + 4, arm_y - 1, right_arm_x + 10, arm_y + 6), fill=trim)
        d.rectangle((right_arm_x + 8, arm_y + 1, right_arm_x + 15, arm_y + 3), fill=PAL["white"])
    if base_pose == "taking_damage":
        d.rectangle((x - 3, y + 5, x + 1, y + 8), fill=PAL["red"])
        d.rectangle((x + 28, y + 20, x + 31, y + 23), fill=PAL["red"])

    if direction < 0:
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return img


def generate_characters(manifest: dict[str, dict]) -> None:
    animations = {
        "idle": 4,
        "walking": 6,
        "walking_left": 6,
        "walking_right": 6,
        "running": 6,
        "jumping": 2,
        "falling": 2,
        "kick": 3,
        "punching": 3,
        "hitting": 3,
        "taking_damage": 2,
        "shooting": 4,
        "lying_dead": 2,
    }
    for char_id, spec in CHARACTER_SUIT_SPECS.items():
        main = draw_suit_character(spec, "idle", 0)
        save(main, f"playable_characters/{char_id}/main_body.png", manifest)
        save(main, f"playable_characters/{char_id}/idle_body.png", manifest)
        for anim, count in animations.items():
            for i in range(count):
                img = draw_suit_character(spec, anim, i)
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


PLATFORM_COMPONENT_ROLES = (
    "top_left",
    "top_inner",
    "top_right",
    "body_left",
    "body_inner",
    "body_right",
    "bottom_left",
    "bottom_inner",
    "bottom_right",
    "outer_left",
    "outer_right",
)


SEAMLESS_PLATFORM_COMPONENT_ROLES = {
    "body_left",
    "body_right",
    "bottom_left",
    "bottom_inner",
    "bottom_right",
}


def seamless_platform_component(
    kind: str,
    role: str,
    outline: tuple[int, int, int, int],
    body: tuple[int, int, int, int],
    mid: tuple[int, int, int, int],
    hi: tuple[int, int, int, int],
    cap_hi: tuple[int, int, int, int],
    accent: tuple[int, int, int, int],
) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    is_left = role.endswith("_left")
    is_right = role.endswith("_right")

    if role.startswith("body"):
        d.rectangle((0, 0, 15, 15), fill=body)
        d.rectangle((0, 0, 15, 3), fill=mid)
        d.rectangle((4, 1, 11, 1), fill=hi)
        d.rectangle((5, 9, 11, 10), fill=mid)
        d.point((3, 6), fill=outline)
        d.point((12, 12), fill=outline)

        if is_left:
            d.rectangle((0, 0, 1, 15), fill=outline)
            d.rectangle((2, 2, 3, 6), fill=mid)
            d.point((2, 10), fill=outline)
            d.rectangle((14, 0, 15, 15), fill=body)
            d.rectangle((14, 0, 15, 3), fill=mid)
        if is_right:
            d.rectangle((14, 0, 15, 15), fill=outline)
            d.rectangle((12, 2, 13, 6), fill=mid)
            d.point((13, 10), fill=outline)
            d.rectangle((0, 0, 1, 15), fill=body)
            d.rectangle((0, 0, 1, 3), fill=mid)

        if kind in {"ice", "summit"}:
            d.rectangle((7, 5, 8, 12), fill=rgba("#1f708d"))
            d.point((8, 4), fill=accent)
            d.point((8, 9), fill=accent)
        elif kind == "crumble":
            d.line((6, 3, 8, 8, 7, 13), fill=accent, width=1)
        elif kind == "moss" and is_left:
            d.rectangle((2, 0, 4, 4), fill=rgba("#314f28"))
            d.rectangle((2, 0, 3, 1), fill=accent)
        return img

    d.rectangle((0, 0, 15, 7), fill=body)
    d.rectangle((0, 0, 15, 2), fill=mid)
    d.rectangle((3, 1, 12, 1), fill=hi)
    d.rectangle((0, 7, 15, 8), fill=outline)

    if role == "bottom_inner":
        d.polygon([(3, 8), (12, 8), (11, 10), (9, 10), (8, 13), (7, 13), (6, 10), (4, 10)], fill=outline)
        d.polygon([(5, 8), (10, 8), (9, 9), (8, 11), (7, 11), (6, 9)], fill=body)
        d.point((4, 5), fill=outline)
        d.point((11, 4), fill=mid)
    elif is_left:
        d.polygon([(0, 0), (15, 0), (0, 15)], fill=outline)
        d.polygon([(2, 1), (14, 1), (2, 12)], fill=body)
        d.polygon([(2, 1), (13, 1), (2, 4)], fill=mid)
        d.line((1, 13, 6, 8), fill=outline, width=1)
        d.point((5, 6), fill=hi)
        if kind == "moss":
            d.rectangle((2, 0, 4, 3), fill=rgba("#314f28"))
            d.point((2, 0), fill=accent)
    elif is_right:
        d.polygon([(0, 0), (15, 0), (15, 15)], fill=outline)
        d.polygon([(1, 1), (13, 1), (13, 12)], fill=body)
        d.polygon([(2, 1), (13, 1), (13, 4)], fill=mid)
        d.line((14, 13, 9, 8), fill=outline, width=1)
        d.point((10, 6), fill=hi)

    if kind in {"snow", "ice"}:
        d.rectangle((4, 0, 8, 1), fill=cap_hi)
    if kind == "summit" and role == "bottom_inner":
        d.rectangle((6, 4, 10, 5), fill=accent)
        d.point((8, 3), fill=rgba("#d8f6ff"))
    if kind == "crumble":
        for x, y in [(4, 11), (10, 6), (12, 13)]:
            d.point((x, y), fill=outline)
    return img


def platform_component(kind: str, role: str) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    if kind == "moss":
        outline = rgba("#07100b")
        body = rgba("#263229")
        mid = rgba("#465444")
        hi = rgba("#7b895f")
        cap = rgba("#3d6b35")
        cap_hi = rgba("#8eb35b")
        soil = rgba("#322719")
        accent = rgba("#74bf57")
    elif kind == "stone":
        outline = rgba("#080d13")
        body = rgba("#27333b")
        mid = rgba("#46525c")
        hi = rgba("#7e8b91")
        cap = rgba("#51635a")
        cap_hi = rgba("#8fa18a")
        soil = rgba("#2a2521")
        accent = rgba("#5bd0d8")
    elif kind == "snow":
        outline = rgba("#08101c")
        body = rgba("#1f2e3e")
        mid = rgba("#40576a")
        hi = rgba("#91a6b5")
        cap = rgba("#a8c2dc")
        cap_hi = rgba("#f4fbff")
        soil = rgba("#2c3b4f")
        accent = rgba("#d8f6ff")
    elif kind == "ice":
        outline = rgba("#050c18")
        body = rgba("#18243b")
        mid = rgba("#2c4b68")
        hi = rgba("#65b7d7")
        cap = rgba("#779cc4")
        cap_hi = rgba("#e9fbff")
        soil = rgba("#172239")
        accent = rgba("#55e8ff")
    elif kind == "summit":
        outline = rgba("#17151f")
        body = rgba("#74808b")
        mid = rgba("#aab4bd")
        hi = rgba("#f0f6ff")
        cap = rgba("#d8d8d0")
        cap_hi = rgba("#fff6d0")
        soil = rgba("#6f6580")
        accent = rgba("#e9b84f")
    else:
        outline = rgba("#140d12")
        body = rgba("#40353a")
        mid = rgba("#6c5f67")
        hi = rgba("#aca6aa")
        cap = rgba("#9aa0a5")
        cap_hi = rgba("#e8edf2")
        soil = rgba("#31222b")
        accent = rgba("#c84a4a")

    if role in SEAMLESS_PLATFORM_COMPONENT_ROLES:
        return seamless_platform_component(kind, role, outline, body, mid, hi, cap_hi, accent)

    is_left = role.endswith("_left") or role == "outer_left"
    is_right = role.endswith("_right") or role == "outer_right"
    is_top = role.startswith("top")
    is_bottom = role.startswith("bottom")
    is_outer = role.startswith("outer")

    # Chunky outline mask. Edge pieces deliberately have an irregular outside
    # silhouette, while inner/body tiles stay clean so they can repeat.
    if is_left:
        pts = [(1, 0), (15, 0), (15, 16), (3, 16), (0, 12), (0, 4)]
    elif is_right:
        pts = [(0, 0), (14, 0), (16, 5), (16, 12), (13, 16), (0, 16)]
    else:
        pts = [(0, 0), (16, 0), (16, 16), (0, 16)]
    if is_bottom:
        if is_left:
            pts = [(2, 0), (16, 0), (14, 10), (8, 16), (2, 13), (0, 6)]
        elif is_right:
            pts = [(0, 0), (14, 0), (16, 6), (14, 13), (8, 16), (2, 10)]
        else:
            pts = [(0, 0), (16, 0), (13, 12), (8, 16), (3, 12)]
    d.polygon(pts, fill=outline)

    inset_left = 2 if is_left else 1
    inset_right = 13 if is_right else 14
    d.rectangle((inset_left, 1, inset_right, 14), fill=body)
    d.rectangle((inset_left + 1, 2, inset_right - 1, 6), fill=mid)
    d.rectangle((inset_left + 2, 3, min(inset_right - 2, inset_left + 7), 4), fill=hi)

    if is_top:
        d.rectangle((inset_left, 3, inset_right, 9), fill=soil)
        d.rectangle((inset_left, 0, inset_right, 3), fill=cap)
        d.rectangle((inset_left + 1, 0, inset_right - 1, 1), fill=cap_hi)
        if kind in {"snow", "ice", "summit", "crumble"}:
            d.rectangle((inset_left, 0, inset_right, 4), fill=cap)
            d.rectangle((inset_left + 1, 0, inset_right - 1, 2), fill=cap_hi)
            if role == "top_inner":
                d.rectangle((5, 3, 9, 4), fill=rgba("#ffffff"))
        else:
            for x in range(inset_left + 2, inset_right, 5):
                d.rectangle((x, -1, x, 1 + (x % 2)), fill=cap_hi)
        d.rectangle((inset_left + 1, 10, inset_right - 1, 14), fill=body)

    if role.startswith("body"):
        d.rectangle((inset_left + 1, 1, inset_right - 1, 14), fill=body)
        d.rectangle((inset_left + 2, 2, inset_right - 2, 3), fill=mid)
        d.line((inset_left + 3, 7, inset_right - 3, 10), fill=outline, width=1)
        if kind in {"ice", "summit"}:
            d.rectangle((7, 5, 9, 12), fill=rgba("#1f708d"))
            d.rectangle((8, 4, 8, 10), fill=accent)
        elif kind == "crumble":
            d.line((6, 3, 8, 8, 7, 13), fill=accent, width=1)

    if is_bottom:
        d.rectangle((inset_left + 1, 1, inset_right - 1, 7), fill=body)
        d.rectangle((inset_left + 2, 2, inset_right - 2, 3), fill=mid)
        d.polygon([(inset_left + 2, 8), (8, 15), (inset_right - 2, 8)], fill=outline)
        d.polygon([(inset_left + 4, 8), (8, 13), (inset_right - 4, 8)], fill=body)
        if kind in {"snow", "ice"}:
            d.polygon([(5, 0), (7, 9), (9, 0)], fill=cap_hi)

    if is_outer:
        d.rectangle((5 if is_left else 0, 1, 15 if is_left else 10, 14), fill=body)
        d.rectangle((7 if is_left else 2, 2, 13 if is_left else 8, 3), fill=hi)
        d.rectangle((2 if is_left else 13, 4, 3 if is_left else 14, 12), fill=outline)

    if kind == "moss" and role in {"body_left", "bottom_left", "outer_left"}:
        d.rectangle((3, 0, 5, 5), fill=rgba("#314f28"))
        d.rectangle((3, 0, 4, 1), fill=accent)
    if kind == "summit" and "inner" in role:
        d.rectangle((6, 7, 10, 8), fill=accent)
        d.rectangle((8, 5, 8, 10), fill=rgba("#d8f6ff"))
    if kind == "crumble":
        for x, y in [(4, 11), (10, 6), (12, 13)]:
            d.point((x, y), fill=outline)
    return img


def platform_component_assets(folder: str, kind: str) -> list[tuple[str, Image.Image]]:
    return [
        (f"environment/{folder}/platform_{kind}_{role}.png", platform_component(kind, role))
        for role in PLATFORM_COMPONENT_ROLES
    ]


def platform_variant(kind: str) -> Image.Image:
    if kind == "pillar":
        img = canvas(32, 56)
        d = ImageDraw.Draw(img)
        d.polygon([(5, 7), (25, 3), (28, 52), (9, 55)], fill=PAL["outline"])
        d.polygon([(8, 8), (23, 5), (25, 49), (11, 52)], fill=rgba("#283642"))
        for y in range(9, 49, 9):
            d.rectangle((8, y, 24, y + 1), fill=rgba("#111821"))
            d.rectangle((10 + (y % 3), y + 3, 17 + (y % 5), y + 4), fill=rgba("#6f7f82"))
            d.point((22, y + 5), fill=rgba("#9ba99d"))
        d.rectangle((4, 1, 28, 8), fill=PAL["snow_shadow"])
        d.rectangle((6, 0, 25, 4), fill=PAL["snow"])
        d.rectangle((12, 22, 18, 23), fill=PAL["cyan"])
        d.rectangle((15, 18, 15, 30), fill=PAL["cyan_light"])
        return img
    if kind == "cliff":
        img = canvas(64, 40)
        d = ImageDraw.Draw(img)
        d.polygon([(0, 10), (13, 7), (31, 8), (47, 5), (62, 8), (63, 17), (54, 27), (42, 38), (19, 35), (5, 24)], fill=PAL["outline"])
        d.polygon([(3, 11), (15, 9), (31, 10), (47, 7), (59, 10), (59, 17), (51, 25), (40, 34), (20, 31), (7, 23)], fill=rgba("#2f3b45"))
        d.rectangle((2, 4, 59, 9), fill=PAL["snow_shadow"])
        d.rectangle((5, 1, 55, 4), fill=PAL["snow"])
        for x, y, w in [(9, 17, 9), (25, 14, 14), (43, 18, 10), (33, 27, 11)]:
            d.rectangle((x, y, x + w, y + 3), fill=rgba("#56666c"))
            d.rectangle((x + 1, y, x + w - 2, y), fill=rgba("#9fa99f"))
        for x in (16, 31, 49):
            d.line((x, 11, x + 8, 30), fill=rgba("#111821"), width=1)
            d.point((x + 2, 18), fill=PAL["cyan"])
        return img
    if kind == "floating_snow":
        img = floating_island()
        d = ImageDraw.Draw(img)
        d.rectangle((8, 2, 86, 10), fill=PAL["snow_shadow"])
        d.rectangle((12, 0, 78, 5), fill=PAL["snow"])
        for x in range(18, 81, 17):
            d.polygon([(x, 7), (x + 2, 23), (x + 4, 7)], fill=PAL["snow"])
        return img
    return platform(32, 18, kind)


def chunky_platform(kind: str, w: int = 48, h: int = 30) -> Image.Image:
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    if kind.startswith("moss"):
        outline = rgba("#07100b")
        body = rgba("#263229")
        mid = rgba("#465444")
        light = rgba("#7b895f")
        top = rgba("#3d6b35")
        top_hi = rgba("#8eb35b")
        soil = rgba("#322719")
        glow = rgba("#76f29a")
    elif kind.startswith("snow") or kind.startswith("ice"):
        outline = rgba("#08101c")
        body = rgba("#1f2e3e")
        mid = rgba("#40576a")
        light = rgba("#91a6b5")
        top = PAL["snow_shadow"]
        top_hi = PAL["snow"]
        soil = rgba("#374556")
        glow = PAL["cyan"]
    elif kind.startswith("summit"):
        outline = rgba("#1d2230")
        body = rgba("#6f7777")
        mid = rgba("#a5a99a")
        light = rgba("#fff2bf")
        top = rgba("#cadbe5")
        top_hi = rgba("#fffdf0")
        soil = rgba("#8f6427")
        glow = PAL["gold_light"]
    else:
        outline = rgba("#091019")
        body = rgba("#2d3944")
        mid = rgba("#53636a")
        light = rgba("#9aa69f")
        top = rgba("#68777a")
        top_hi = rgba("#bdc5b8")
        soil = rgba("#353b3d")
        glow = PAL["cyan"]

    top_y = 6
    top_jag = [((i * 7 + len(kind)) % 3) - 1 for i in range(8)]
    top_points = []
    for i in range(8):
        x = round(i * (w - 1) / 7)
        top_points.append((x, top_y + top_jag[i]))

    if "triangle" in kind:
        outer = [(3, top_y + 2), (w - 4, top_y), (w - 8, top_y + 11), (w // 2 + 6, h - 2), (w // 2 - 8, h - 1), (7, top_y + 13)]
        inner = [(6, top_y + 3), (w - 7, top_y + 2), (w - 11, top_y + 10), (w // 2 + 4, h - 5), (w // 2 - 6, h - 5), (10, top_y + 12)]
    elif "thin" in kind:
        outer = [(1, top_y + 5), (w - 3, top_y + 4), (w - 2, top_y + 14), (5, top_y + 16)]
        inner = [(4, top_y + 6), (w - 6, top_y + 6), (w - 7, top_y + 12), (6, top_y + 13)]
    else:
        outer = [(1, top_y + 4), (9, top_y + 2), (w // 2, top_y + 3), (w - 5, top_y + 1), (w - 1, top_y + 11), (w - 10, h - 5), (w // 2 + 3, h - 2), (w // 2 - 5, h - 4), (10, h - 7), (1, top_y + 14)]
        inner = [(4, top_y + 5), (10, top_y + 4), (w // 2, top_y + 5), (w - 8, top_y + 4), (w - 5, top_y + 11), (w - 12, h - 8), (w // 2 + 2, h - 5), (w // 2 - 4, h - 7), (12, h - 10), (5, top_y + 13)]

    d.polygon(outer, fill=outline)
    d.polygon(inner, fill=body)
    for x in range(6, w - 8, 10):
        y = top_y + 9 + ((x * 7 + h) % 8)
        d.rectangle((x, y, min(w - 8, x + 7), y + 3), fill=mid)
        d.rectangle((x + 1, y, min(w - 9, x + 5), y), fill=light)
    for x in range(5, w - 6, 7):
        y = top_y + 11 + ((x * 5 + len(kind)) % max(5, h - top_y - 14))
        c = light if (x + y) % 3 == 0 else mid if (x + y) % 3 == 1 else outline
        d.point((x, y), fill=c)
        if x + 1 < w - 2 and (x + y) % 4 == 0:
            d.point((x + 1, y), fill=c)

    for i in range(len(top_points) - 1):
        x0, y0 = top_points[i]
        x1, y1 = top_points[i + 1]
        d.polygon([(x0, y0 + 1), (x1, y1 + 1), (x1, y1 + 6), (x0, y0 + 6)], fill=soil)
        d.line((x0, y0, x1, y1), fill=top, width=4)
        d.line((x0 + 1, y0 - 2, x1 - 1, y1 - 2), fill=top_hi, width=2)

    for x in range(9, w - 9, 13):
        if kind.startswith("moss"):
            d.rectangle((x, top_y + 1, x + 1, top_y + 7 + (x % 5)), fill=rgba("#2f5428"))
            d.point((x, top_y + 8 + (x % 5)), fill=top_hi)
        elif kind.startswith("snow") or kind.startswith("ice"):
            d.polygon([(x, top_y + 3), (x + 2, top_y + 15 + (x % 6)), (x + 4, top_y + 3)], fill=PAL["snow"])
            d.point((x + 1, top_y + 7), fill=PAL["cyan_light"])
        elif kind.startswith("summit"):
            d.rectangle((x, top_y + 8, x + 5, top_y + 9), fill=PAL["gold_light"])
            d.rectangle((x + 2, top_y + 5, x + 3, top_y + 13), fill=PAL["cyan_light"])
    if "broken" in kind or "crumble" in kind:
        for x in range(12, w - 8, 14):
            d.line((x, top_y + 2, x - 3, top_y + 10, x + 1, top_y + 16), fill=outline, width=1)
    if "rune" in kind or "stone" in kind or "summit" in kind:
        d.rectangle((w // 2 - 3, top_y + 12, w // 2 + 3, top_y + 13), fill=glow)
        d.point((w // 2, top_y + 10), fill=PAL["white"])
    return img


def tile_cluster(kind: str) -> Image.Image:
    img = canvas(48, 56)
    d = ImageDraw.Draw(img)
    snow = "snow" in kind or "ice" in kind
    moss = "moss" in kind
    summit = "summit" in kind
    base = rgba("#4c5e78")
    shade = rgba("#26354a")
    hi = rgba("#8fa3bb")
    if moss:
        base, shade, hi = rgba("#51624f"), rgba("#253122"), rgba("#91a06e")
    if summit:
        base, shade, hi = rgba("#bdc8d4"), rgba("#50607a"), rgba("#fff2bf")
    for row in range(3):
        for col in range(3):
            x = 4 + col * 14 + ((row + col) % 2)
            y = 4 + row * 14
            d.rectangle((x, y, x + 11, y + 11), fill=shade)
            d.rectangle((x + 1, y + 1, x + 10, y + 10), fill=base)
            d.rectangle((x + 1, y + 1, x + 9, y + 2), fill=hi)
            if snow:
                d.rectangle((x, y, x + 11, y + 3), fill=PAL["snow_shadow"])
                d.rectangle((x + 1, y, x + 9, y + 1), fill=PAL["snow"])
            if moss and (row + col) % 2 == 0:
                d.rectangle((x + 2, y, x + 8, y + 2), fill=rgba("#6d8c47"))
                d.rectangle((x + 4, y - 2, x + 4, y), fill=rgba("#9fb76b"))
            if summit and (row + col) % 2 == 0:
                d.rectangle((x + 4, y + 4, x + 7, y + 5), fill=PAL["gold_light"])
    return img


def hanging_connector(kind: str) -> Image.Image:
    img = canvas(24, 64)
    d = ImageDraw.Draw(img)
    if kind == "chain":
        col = rgba("#5f6978")
        hi = rgba("#b5c2d0")
        for y in range(2, 60, 10):
            d.rectangle((10, y, 14, y + 7), fill=PAL["outline"])
            d.rectangle((11, y + 1, 13, y + 6), fill=col)
            d.point((12, y + 1), fill=hi)
        return img
    if kind == "ladder":
        rail = rgba("#8a5a2c")
        rung = rgba("#c4914a")
        d.rectangle((6, 2, 8, 61), fill=rail)
        d.rectangle((16, 2, 18, 61), fill=rail)
        for y in range(7, 60, 9):
            d.rectangle((5, y, 19, y + 2), fill=rung)
            d.point((6, y), fill=PAL["snow"])
        return img
    d.rectangle((9, 0, 15, 50), fill=rgba("#26354a"))
    d.rectangle((10, 1, 14, 48), fill=rgba("#536982"))
    d.rectangle((8, 0, 16, 3), fill=PAL["snow"])
    return img


def mid_mountain(kind: str) -> Image.Image:
    img = canvas(192, 144)
    d = ImageDraw.Draw(img)
    if kind == "pine":
        far = rgba("#1f3a57", 170)
        mid = rgba("#274d68", 190)
        hi = rgba("#5f7d86", 150)
        snow = rgba("#c8dcec", 145)
    elif kind == "snow":
        far = rgba("#20375a", 170)
        mid = rgba("#314e76", 190)
        hi = rgba("#7f9ebf", 165)
        snow = rgba("#eef6ff", 180)
    elif kind == "summit":
        far = rgba("#405479", 155)
        mid = rgba("#7d8fa8", 180)
        hi = rgba("#fff2bf", 155)
        snow = rgba("#f8fbff", 190)
    else:
        far = rgba("#1a2f4f", 160)
        mid = rgba("#283f66", 185)
        hi = rgba("#687a98", 150)
        snow = rgba("#d8e7f6", 145)
    peaks = [(0, 124), (24, 74), (44, 104), (72, 44), (100, 96), (130, 58), (158, 116), (192, 72), (192, 144), (0, 144)]
    d.polygon(peaks, fill=far)
    d.polygon([(42, 134), (72, 48), (101, 140)], fill=mid)
    d.polygon([(104, 138), (132, 62), (164, 140)], fill=mid)
    d.polygon([(72, 48), (84, 79), (75, 72), (66, 95)], fill=snow)
    d.polygon([(132, 62), (143, 91), (132, 84), (122, 108)], fill=snow)
    d.line((75, 70, 54, 124), fill=hi, width=2)
    d.line((137, 86, 116, 130), fill=hi, width=2)
    if kind in {"ruins", "summit"}:
        for x, y, h in [(30, 88, 28), (146, 80, 34), (156, 94, 23)]:
            d.rectangle((x, y, x + 8, y + h), fill=rgba("#26354a", 150))
            d.rectangle((x - 2, y - 4, x + 10, y), fill=hi)
            d.rectangle((x + 3, y + 7, x + 5, y + 16), fill=rgba("#55b6ff", 110))
    if kind == "pine":
        for x in range(6, 188, 13):
            y = 120 - ((x * 5) % 24)
            d.rectangle((x + 3, y + 10, x + 4, y + 22), fill=rgba("#162b24", 160))
            d.polygon([(x + 3, y), (x - 1, y + 10), (x + 8, y + 10)], fill=rgba("#1f4a36", 175))
            d.polygon([(x + 3, y + 6), (x - 3, y + 17), (x + 10, y + 17)], fill=rgba("#1f4a36", 175))
    return img


def mid_mountain_tile(biome: str, role: str) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    palettes = {
        "pine": (rgba("#020305"), rgba("#111619"), rgba("#1b2820"), rgba("#3f5b37"), rgba("#080b0e"), rgba("#102016")),
        "cloud": (rgba("#020408"), rgba("#12171d"), rgba("#203042"), rgba("#496178"), rgba("#080c12"), rgba("#142438")),
        "snow": (rgba("#02050a"), rgba("#121820"), rgba("#26384a"), rgba("#6c8397"), rgba("#090e15"), rgba("#1d3040")),
        "frozen": (rgba("#020509"), rgba("#101820"), rgba("#1d4158"), rgba("#4f88a7"), rgba("#071019"), rgba("#0f314a")),
        "summit": (rgba("#03040a"), rgba("#15161c"), rgba("#2b2b37"), rgba("#8a7636"), rgba("#0a0b11"), rgba("#46391f")),
    }
    outline, body, accent, highlight, shadow, vein = palettes[biome]
    # Mid-mountain tiles are an opaque second-layer mass, not floating props.
    # Edge silhouettes are drawn with darker shadow pixels instead of alpha
    # so the rear mountain never shows pinholes behind gameplay platforms.
    d.rectangle((0, 0, 15, 15), fill=shadow)

    def stone_noise(mask_left: int = 0, mask_right: int = 15, top: int = 0, bottom: int = 15) -> None:
        marks = [
            (3, 4, 6, 4, accent),
            (10, 7, 12, 7, vein),
            (4, 12, 8, 12, shadow),
        ]
        for x1, y1, x2, y2, color in marks:
            if x1 < mask_left or x2 > mask_right or y1 < top or y2 > bottom:
                continue
            d.rectangle((x1, y1, x2, y2), fill=color)

    if role == "cap":
        d.rectangle((0, 4, 15, 15), fill=body)
        d.rectangle((0, 13, 15, 15), fill=shadow)
        d.rectangle((0, 4, 15, 4), fill=outline)
        if biome == "pine":
            d.rectangle((0, 1, 15, 4), fill=vein)
            d.rectangle((2, 0, 6, 1), fill=accent)
            d.rectangle((10, 0, 13, 1), fill=accent)
        else:
            d.rectangle((0, 1, 15, 4), fill=accent)
            d.rectangle((3, 0, 11, 1), fill=highlight)
        stone_noise(top=7, bottom=13)
    elif role == "left":
        d.polygon([(5, 0), (15, 0), (15, 15), (2, 15), (0, 9)], fill=body)
        d.line((2, 8, 5, 0), fill=outline, width=1)
        d.line((0, 9, 2, 15), fill=outline, width=1)
        d.line((6, 4, 4, 12), fill=accent, width=1)
        stone_noise(mask_left=3)
        if biome in {"snow", "frozen", "summit"}:
            d.rectangle((7, 0, 15, 1), fill=highlight)
    elif role == "right":
        d.polygon([(0, 0), (10, 0), (15, 9), (13, 15), (0, 15)], fill=body)
        d.line((10, 0, 14, 8), fill=outline, width=1)
        d.line((15, 9, 13, 15), fill=outline, width=1)
        d.line((10, 4, 12, 12), fill=shadow, width=1)
        stone_noise(mask_right=12)
        if biome in {"snow", "frozen", "summit"}:
            d.rectangle((0, 0, 8, 1), fill=highlight)
    elif role == "bottom":
        d.polygon([(0, 0), (15, 0), (12, 10), (8, 15), (4, 10)], fill=body)
        d.line((4, 10, 8, 15, 12, 10), fill=shadow, width=1)
        d.rectangle((0, 0, 15, 1), fill=body)
        d.line((6, 2, 8, 12), fill=accent, width=1)
        d.line((10, 2, 8, 12), fill=shadow, width=1)
        stone_noise(mask_left=3, mask_right=12, bottom=10)
        if biome == "frozen":
            d.rectangle((7, 3, 9, 11), fill=PAL["cyan_dark"])
            d.rectangle((8, 3, 8, 9), fill=PAL["cyan_light"])
    else:
        # Interior fill tile: deliberately opaque and borderless so repeated
        # mountain bodies do not create grid seams behind gameplay platforms.
        d.rectangle((0, 0, 15, 15), fill=body)
        d.rectangle((3, 5, 5, 5), fill=accent)
        d.rectangle((11, 9, 12, 9), fill=vein)
        if biome == "pine":
            d.rectangle((6, 7, 7, 9), fill=rgba("#142318"))
        if biome == "summit":
            d.rectangle((7, 7, 9, 7), fill=rgba("#5a4d2a"))
    return img


def floating_island() -> Image.Image:
    img = canvas(96, 56)
    d = ImageDraw.Draw(img)
    d.polygon([(7, 13), (24, 9), (52, 10), (79, 7), (91, 18), (84, 29), (69, 43), (48, 54), (27, 44), (12, 32), (3, 24)], fill=PAL["outline"])
    d.polygon([(11, 14), (25, 11), (52, 12), (77, 10), (87, 19), (80, 28), (66, 39), (48, 49), (29, 40), (14, 30), (8, 24)], fill=rgba("#28343b"))
    for x, y, ww, hh in [(17, 20, 13, 8), (34, 17, 17, 11), (57, 20, 18, 11), (28, 32, 15, 7), (50, 36, 13, 7), (65, 29, 9, 5)]:
        d.rectangle((x, y, x + ww, y + hh), fill=rgba("#56635f"))
        d.rectangle((x, y, x + ww - 2, y), fill=rgba("#a1aa98"))
        d.point((x + ww - 2, y + hh - 1), fill=PAL["outline"])
    for x in range(14, 83, 11):
        y = 19 + ((x * 5) % 20)
        d.point((x, y), fill=PAL["cyan"] if x % 3 == 0 else rgba("#8a946d"))
    d.rectangle((8, 7, 86, 14), fill=PAL["soil"])
    d.line((7, 7, 22, 5, 42, 6, 59, 4, 88, 6), fill=PAL["grass_dark"], width=4)
    d.line((11, 3, 29, 2, 46, 3, 66, 1, 80, 3), fill=PAL["grass"], width=2)
    for x in (20, 33, 62, 74, 83):
        d.rectangle((x, 0, x + 1, 5 + (x % 3)), fill=PAL["moss_light"])
    return img


def grass_clump() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((1, 13, 14, 15), fill=rgba("#152317"))
    for x, h in [(2, 5), (5, 9), (8, 6), (12, 8), (14, 4)]:
        d.rectangle((x, 13 - h, x + 1, 13), fill=PAL["moss"])
        d.point((x, 13 - h), fill=PAL["moss_light"])
        if x % 2 == 0:
            d.point((x + 1, 12 - h // 2), fill=rgba("#35472c"))
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
    leaf = rgba("#884333") if autumn else PAL["leaf_mid"]
    light = rgba("#c05c3d") if autumn else PAL["moss_light"]
    d.rectangle((5, 13, w - 6, h - 4), fill=rgba("#102319"))
    for pts in [
        [(2, 15), (7, 9), (15, 11), (17, 19), (8, 21)],
        [(9, 9), (17, 4), (25, 8), (25, 17), (14, 18)],
        [(18, 12), (26, 8), (31, 14), (28, 21), (19, 20)],
        [(7, 16), (14, 13), (25, 16), (24, 23), (8, 23)],
    ]:
        d.polygon(pts, fill=leaf)
    for box in [(8, 8, 13, 10), (16, 7, 22, 9), (21, 12, 26, 14)]:
        d.rectangle(box, fill=light)
    for x, y in [(6, 18), (15, 13), (28, 16)]:
        d.point((x, y), fill=PAL["cyan"] if not autumn else PAL["orange"])
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
    d.rectangle((29, 44, 36, 82), fill=PAL["outline"])
    d.rectangle((31, 42, 37, 82), fill=PAL["bark_dark"])
    for y in range(48, 80, 9):
        d.point((33, y), fill=PAL["bark"])
    if kind == "dead":
        d.rectangle((20, 28, 43, 34), fill=PAL["bark_dark"])
        d.line((34, 42, 48, 24), fill=PAL["bark"], width=3)
        d.line((30, 45, 16, 29), fill=PAL["bark"], width=3)
        d.line((38, 58, 52, 48), fill=PAL["bark"], width=2)
        d.line((28, 60, 13, 54), fill=PAL["bark"], width=2)
        return img
    if kind == "pine":
        for y, half in [(8, 15), (20, 21), (34, 26), (50, 30)]:
            d.polygon([(32, y), (32 - half, y + 25), (32 + half, y + 25)], fill=PAL["outline"])
            d.polygon([(32, y + 3), (32 - half + 4, y + 22), (32 + half - 4, y + 22)], fill=PAL["leaf_dark"])
            d.polygon([(32, y + 7), (32 - half + 8, y + 20), (32 + half - 8, y + 20)], fill=PAL["leaf_mid"])
            d.rectangle((25, y + 17, 35, y + 18), fill=PAL["moss_light"])
            d.point((39, y + 22), fill=PAL["cyan_dark"])
    else:
        for pts in [
            [(5, 26), (13, 9), (35, 8), (37, 31), (20, 39)],
            [(24, 10), (42, 4), (58, 15), (55, 35), (35, 33)],
            [(13, 42), (24, 25), (49, 28), (48, 56), (22, 58)],
            [(0, 43), (8, 29), (27, 31), (28, 54), (8, 56)],
            [(36, 43), (45, 30), (63, 35), (62, 59), (42, 58)],
        ]:
            d.polygon(pts, fill=PAL["leaf_dark"])
        for pts in [[(12, 15), (31, 13), (28, 24), (11, 28)], [(29, 10), (50, 12), (47, 23), (30, 25)], [(20, 31), (42, 33), (39, 45), (18, 46)]]:
            d.polygon(pts, fill=PAL["leaf_mid"])
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


def canopy_blob(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, seed: int, autumn: bool = False) -> None:
    dark = rgba("#173923") if not autumn else rgba("#513020")
    mid = rgba("#2f7a3b") if not autumn else rgba("#8e5131")
    light = rgba("#86b84e") if not autumn else rgba("#c46a3f")
    acid = rgba("#aacf52") if not autumn else PAL["orange"]
    outline = rgba("#10261b")
    blocks = [
        (x + w * 0.18, y + h * 0.02, w * 0.44, h * 0.20, light),
        (x + w * 0.04, y + h * 0.18, w * 0.34, h * 0.26, mid),
        (x + w * 0.36, y + h * 0.14, w * 0.42, h * 0.28, mid),
        (x + w * 0.64, y + h * 0.26, w * 0.30, h * 0.30, mid),
        (x + w * 0.12, y + h * 0.43, w * 0.36, h * 0.30, dark),
        (x + w * 0.42, y + h * 0.40, w * 0.46, h * 0.34, dark),
        (x + w * 0.24, y + h * 0.28, w * 0.24, h * 0.18, acid),
        (x + w * 0.56, y + h * 0.08, w * 0.18, h * 0.18, acid),
    ]
    for bx, by, bw, bh, col in blocks:
        d.rectangle((round(bx), round(by), round(bx + bw), round(by + bh)), fill=outline)
        d.rectangle((round(bx) + 2, round(by) + 2, round(bx + bw) - 1, round(by + bh) - 1), fill=col)
    for i in range(22):
        px = x + 4 + ((i * 13 + seed * 7) % max(8, w - 8))
        py = y + 4 + ((i * 17 + seed * 11) % max(8, h - 8))
        color = [dark, mid, light, acid][(i + seed) % 4]
        d.rectangle((px, py, px + 3 + (i % 3), py + 2 + (i % 2)), fill=color)


def pixel_tree_variant(kind: str) -> Image.Image:
    sizes = {
        "round_canopy": (96, 96),
        "tall_canopy": (84, 128),
        "forked_oak": (88, 96),
        "small_round": (56, 64),
        "sapling_pine": (48, 72),
        "dead_branch": (52, 80),
        "wind_bent_leaf": (80, 88),
        "wide_bush_tree": (92, 74),
        "autumn_block": (80, 88),
    }
    w, h = sizes[kind]
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    trunk = rgba("#6b3c1f")
    trunk_dark = rgba("#2b1820")
    trunk_hi = rgba("#a4603b")

    if kind == "dead_branch":
        d.rectangle((w // 2 - 4, 24, w // 2 + 5, h - 8), fill=trunk_dark)
        d.rectangle((w // 2 - 2, 22, w // 2 + 3, h - 10), fill=rgba("#747565"))
        branches = [
            (w // 2, 35, 14, 18),
            (w // 2 + 1, 43, 40, 24),
            (w // 2, 55, 18, 49),
            (w // 2 + 2, 28, 35, 14),
        ]
        for x0, y0, x1, y1 in branches:
            d.line((x0, y0, x1, y1), fill=trunk_dark, width=5)
            d.line((x0, y0, x1, y1), fill=rgba("#7f806e"), width=3)
        for x, y in [(13, 18), (39, 22), (18, 49), (35, 14)]:
            d.rectangle((x, y, x + 3, y + 4), fill=rgba("#a0a188"))
        return img

    if kind == "sapling_pine":
        d.rectangle((w // 2 - 3, 31, w // 2 + 4, h - 6), fill=trunk_dark)
        d.rectangle((w // 2 - 1, 30, w // 2 + 2, h - 7), fill=trunk)
        for y, half in [(6, 9), (17, 14), (30, 20), (44, 24)]:
            d.polygon([(w // 2, y), (w // 2 - half, y + 22), (w // 2 + half, y + 22)], fill=rgba("#10261b"))
            d.polygon([(w // 2, y + 2), (w // 2 - half + 4, y + 19), (w // 2 + half - 4, y + 19)], fill=rgba("#2f7a3b"))
            d.rectangle((w // 2 - 4, y + 14, w // 2 + 8, y + 16), fill=rgba("#86b84e"))
        return img

    if kind == "tall_canopy":
        d.rectangle((w // 2 - 7, 44, w // 2 + 8, h - 8), fill=trunk_dark)
        d.rectangle((w // 2 - 3, 42, w // 2 + 6, h - 10), fill=trunk)
        d.line((w // 2, 61, w // 2 - 24, 43), fill=trunk_dark, width=5)
        d.line((w // 2 + 2, 57, w // 2 + 25, 37), fill=trunk_dark, width=5)
        d.rectangle((w // 2 + 5, 75, w // 2 + 13, 78), fill=trunk_hi)
        canopy_blob(d, 8, 2, 68, 58, 5)
        canopy_blob(d, 3, 33, 38, 36, 6)
        canopy_blob(d, 42, 34, 36, 36, 7)
    elif kind == "forked_oak":
        d.rectangle((w // 2 - 8, 44, w // 2 + 6, h - 8), fill=trunk_dark)
        d.rectangle((w // 2 - 4, 43, w // 2 + 4, h - 10), fill=trunk)
        for x1, y1 in [(22, 44), (31, 32), (56, 33), (68, 46)]:
            d.line((w // 2, 57, x1, y1), fill=trunk_dark, width=6)
            d.line((w // 2, 56, x1, y1), fill=trunk, width=3)
        canopy_blob(d, 2, 8, 42, 42, 8)
        canopy_blob(d, 28, 3, 50, 44, 9)
        canopy_blob(d, 45, 27, 38, 36, 10)
    elif kind == "small_round":
        d.rectangle((w // 2 - 4, 31, w // 2 + 5, h - 6), fill=trunk_dark)
        d.rectangle((w // 2 - 1, 29, w // 2 + 3, h - 7), fill=trunk)
        canopy_blob(d, 4, 3, 48, 39, 11)
    elif kind == "wind_bent_leaf":
        d.line((w // 2 - 2, h - 8, w // 2 + 3, 44, w // 2 + 16, 28), fill=trunk_dark, width=12)
        d.line((w // 2, h - 10, w // 2 + 5, 45, w // 2 + 17, 29), fill=trunk, width=6)
        d.line((w // 2 + 5, 53, w // 2 - 18, 37), fill=trunk_dark, width=5)
        canopy_blob(d, 16, 2, 58, 45, 12)
        canopy_blob(d, 3, 25, 36, 30, 13)
    elif kind == "wide_bush_tree":
        d.rectangle((w // 2 - 5, 38, w // 2 + 6, h - 6), fill=trunk_dark)
        d.rectangle((w // 2 - 2, 36, w // 2 + 4, h - 7), fill=trunk)
        canopy_blob(d, 3, 2, 86, 50, 14)
    elif kind == "autumn_block":
        d.rectangle((w // 2 - 6, 39, w // 2 + 7, h - 7), fill=trunk_dark)
        d.rectangle((w // 2 - 2, 38, w // 2 + 5, h - 8), fill=trunk)
        canopy_blob(d, 6, 3, 68, 54, 15, autumn=True)
    else:
        d.rectangle((w // 2 - 8, 42, w // 2 + 8, h - 8), fill=trunk_dark)
        d.rectangle((w // 2 - 3, 40, w // 2 + 5, h - 10), fill=trunk)
        d.rectangle((w // 2 + 2, 58, w // 2 + 11, 61), fill=trunk_hi)
        canopy_blob(d, 6, 0, w - 12, 56, 16)

    d.rectangle((w // 2 - 14, h - 7, w // 2 + 16, h - 3), fill=rgba("#10261b"))
    d.rectangle((w // 2 - 5, h - 10, w // 2 + 5, h - 5), fill=trunk_hi)
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
    d.rectangle((w // 12, y, w - w // 10, y + h // 4), fill=rgba("#233246", 205))
    parts = [
        (w * 0.06, y - h * 0.08, w * 0.30, y + h * 0.30),
        (w * 0.22, y - h * 0.34, w * 0.52, y + h * 0.24),
        (w * 0.45, y - h * 0.22, w * 0.75, y + h * 0.28),
        (w * 0.68, y - h * 0.05, w * 0.94, y + h * 0.30),
    ]
    for i, box in enumerate(parts):
        if flat and i == 1:
            box = (box[0], y - h * 0.18, box[2], y + h * 0.18)
        x0, y0, x1, y1 = map(int, box)
        d.rectangle((x0, y0 + (i % 2) * 2, x1, y1), fill=PAL["cloud_mid"])
        d.rectangle((x0 + max(1, w // 30), y0, x1 - max(1, w // 25), y0 + max(2, h // 8)), fill=rgba("#7d94a3", 190))
    for box in parts[1:3]:
        x0, y0, x1, y1 = map(int, box)
        d.rectangle((x0 + 5, y0 + 4, x1 - 5, y0 + 7), fill=PAL["cloud"])
    for x in range(4, w - 4, max(9, w // 12)):
        d.point((x, y + (x * 7) % max(2, h // 3)), fill=rgba("#111827", 180))
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


def coin_variant(color: tuple[int, int, int, int] = PAL["gold"], glow: tuple[int, int, int, int] = PAL["gold_light"]) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    dark = tuple(max(0, c - 70) for c in color[:3]) + (255,)
    d.ellipse((2, 1, 14, 15), fill=PAL["outline"])
    d.ellipse((3, 2, 13, 14), fill=dark)
    d.ellipse((5, 3, 11, 13), fill=color)
    d.rectangle((6, 4, 10, 5), fill=glow)
    d.rectangle((5, 7, 11, 9), fill=dark)
    d.rectangle((7, 7, 9, 9), fill=glow)
    return img


def gem(color: tuple[int, int, int, int], light: tuple[int, int, int, int], dark: tuple[int, int, int, int]) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.polygon([(8, 1), (14, 6), (11, 14), (5, 14), (2, 6)], fill=dark)
    d.polygon([(8, 2), (13, 6), (10, 13), (6, 13), (3, 6)], fill=color)
    d.polygon([(7, 3), (11, 6), (8, 8), (5, 6)], fill=light)
    d.rectangle((6, 12, 10, 13), fill=PAL["white"])
    return img


def crown_collectible(color: tuple[int, int, int, int] = PAL["gold"]) -> Image.Image:
    img = canvas(20, 18)
    d = ImageDraw.Draw(img)
    dark = tuple(max(0, c - 85) for c in color[:3]) + (255,)
    d.rectangle((3, 11, 17, 15), fill=PAL["outline"])
    d.rectangle((4, 10, 16, 14), fill=dark)
    d.polygon([(4, 11), (4, 4), (8, 9), (10, 3), (12, 9), (16, 4), (16, 11)], fill=PAL["outline"])
    d.polygon([(5, 10), (5, 6), (8, 10), (10, 5), (12, 10), (15, 6), (15, 10)], fill=color)
    for x in (5, 10, 15):
        d.rectangle((x - 1, 3, x + 1, 5), fill=PAL["white"])
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


def spikes(kind: str = "stone") -> Image.Image:
    img = canvas(24, 20)
    d = ImageDraw.Draw(img)
    base = rgba("#2c3748")
    spike = rgba("#9ba6b3")
    shine = rgba("#e9f2ff")
    if kind == "ice":
        base = rgba("#1a3550")
        spike = rgba("#a8d8f8")
        shine = PAL["white"]
    if kind == "summit":
        base = rgba("#5a4b2d")
        spike = rgba("#d9d2bd")
        shine = PAL["gold_light"]
    d.rectangle((0, 15, 23, 19), fill=base)
    d.rectangle((0, 14, 23, 15), fill=rgba("#607086"))
    for x, h in ((1, 11), (6, 15), (11, 13), (16, 16), (20, 10)):
        d.polygon([(x, 15), (x + 2, 15 - h), (x + 5, 15)], fill=PAL["outline"])
        d.polygon([(x + 1, 14), (x + 2, 16 - h), (x + 4, 14)], fill=spike)
        d.line((x + 2, 14 - h, x + 2, 12), fill=shine, width=1)
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


def banner_stand(color: tuple[int, int, int, int] = PAL["blue"], symbol: str = "rune") -> Image.Image:
    img = canvas(28, 48)
    d = ImageDraw.Draw(img)
    d.rectangle((5, 2, 7, 45), fill=PAL["bark_dark"])
    d.rectangle((21, 2, 23, 45), fill=PAL["bark_dark"])
    d.rectangle((3, 4, 25, 7), fill=PAL["gold_dark"])
    d.rectangle((6, 7, 22, 33), fill=PAL["outline"])
    dark = tuple(max(0, c - 75) for c in color[:3]) + (255,)
    d.rectangle((8, 8, 20, 31), fill=dark)
    d.rectangle((9, 9, 19, 28), fill=color)
    d.polygon([(8, 31), (14, 26), (20, 31)], fill=color)
    if symbol == "crown":
        d.polygon([(11, 20), (12, 15), (14, 19), (16, 14), (17, 20)], fill=PAL["gold_light"])
    else:
        d.rectangle((13, 14, 15, 24), fill=PAL["gold_light"])
        d.rectangle((11, 18, 17, 19), fill=PAL["gold_light"])
    d.rectangle((2, 44, 26, 47), fill=PAL["stone_deep"])
    return img


def hanging_lantern(kind: str = "blue") -> Image.Image:
    img = canvas(24, 40)
    d = ImageDraw.Draw(img)
    glow = PAL["cyan"] if kind == "blue" else PAL["gold_light"] if kind == "gold" else PAL["green"]
    d.rectangle((11, 0, 13, 8), fill=PAL["bark_dark"])
    d.rectangle((7, 6, 17, 8), fill=PAL["gold_dark"])
    d.rectangle((5, 9, 19, 28), fill=PAL["outline"])
    d.rectangle((7, 11, 17, 26), fill=PAL["cyan_dark"])
    d.rectangle((8, 13, 16, 24), fill=glow)
    d.rectangle((10, 14, 14, 21), fill=PAL["white"])
    d.rectangle((7, 28, 17, 31), fill=PAL["gold_dark"])
    d.rectangle((4, 34, 20, 37), fill=PAL["stone_deep"])
    return img


def pedestal_lamp(kind: str = "blue") -> Image.Image:
    img = canvas(32, 48)
    d = ImageDraw.Draw(img)
    glow = PAL["cyan"] if kind == "blue" else PAL["green"] if kind == "green" else PAL["gold_light"]
    d.rectangle((10, 28, 22, 44), fill=PAL["stone_deep"])
    d.rectangle((12, 26, 20, 42), fill=rgba("#4c5e78"))
    d.rectangle((6, 42, 26, 47), fill=PAL["stone_deep"])
    d.rectangle((8, 24, 24, 29), fill=PAL["stone_light"])
    d.polygon([(16, 5), (24, 16), (16, 27), (8, 16)], fill=PAL["outline"])
    d.polygon([(16, 7), (22, 16), (16, 25), (10, 16)], fill=glow)
    d.rectangle((14, 10, 18, 12), fill=PAL["white"])
    return img


def sign_board(kind: str = "wood") -> Image.Image:
    img = canvas(40, 28)
    d = ImageDraw.Draw(img)
    d.rectangle((7, 18, 10, 27), fill=PAL["bark_dark"])
    d.rectangle((30, 18, 33, 27), fill=PAL["bark_dark"])
    trim = PAL["gold_dark"] if kind == "wood" else PAL["cyan"]
    d.rectangle((3, 7, 36, 20), fill=PAL["outline"])
    d.rectangle((5, 9, 34, 18), fill=PAL["bark"] if kind == "wood" else rgba("#4c5e78"))
    d.rectangle((7, 11, 32, 12), fill=trim)
    d.rectangle((14, 15, 23, 16), fill=trim)
    return img


def rope_posts(kind: str = "plain") -> Image.Image:
    img = canvas(56, 28)
    d = ImageDraw.Draw(img)
    post = PAL["bark"] if kind == "plain" else rgba("#4c5e78")
    for x in (4, 28, 48):
        d.rectangle((x, 6, x + 4, 27), fill=PAL["outline"])
        d.rectangle((x + 1, 5, x + 3, 26), fill=post)
        d.rectangle((x - 2, 4, x + 6, 7), fill=PAL["gold_dark"])
    d.line((6, 12, 30, 16, 50, 12), fill=PAL["bark_dark"], width=2)
    d.line((6, 18, 30, 22, 50, 18), fill=PAL["bark_dark"], width=1)
    if kind == "lanterns":
        for x in (19, 39):
            d.rectangle((x, 14, x + 4, 20), fill=PAL["outline"])
            d.rectangle((x + 1, 15, x + 3, 19), fill=PAL["gold_light"])
    return img


def flower_crystal_cluster(kind: str = "blue") -> Image.Image:
    img = canvas(32, 32)
    d = ImageDraw.Draw(img)
    crystal = PAL["cyan"] if kind == "blue" else PAL["green"] if kind == "green" else PAL["violet"]
    d.rectangle((2, 27, 29, 31), fill=PAL["grass_dark"])
    for x, h in [(5, 10), (9, 14), (24, 12), (28, 9)]:
        d.rectangle((x, 27 - h, x + 1, 27), fill=PAL["leaf_mid"])
        d.rectangle((x - 1, 25 - h, x + 2, 28 - h), fill=PAL["white"] if x % 2 else PAL["pink"])
    d.polygon([(16, 5), (23, 16), (16, 28), (9, 16)], fill=PAL["outline"])
    d.polygon([(16, 7), (21, 16), (16, 25), (11, 16)], fill=crystal)
    d.rectangle((14, 10, 18, 12), fill=PAL["white"])
    return img


def skeleton_marker() -> Image.Image:
    img = canvas(32, 48)
    d = ImageDraw.Draw(img)
    d.rectangle((6, 42, 26, 47), fill=PAL["stone_deep"])
    d.rectangle((9, 36, 23, 43), fill=rgba("#4c5e78"))
    d.rectangle((14, 13, 18, 37), fill=rgba("#d8d0bd"))
    d.rectangle((10, 20, 22, 22), fill=rgba("#d8d0bd"))
    d.rectangle((9, 6, 23, 18), fill=PAL["outline"])
    d.rectangle((11, 7, 21, 17), fill=rgba("#e7ddc8"))
    d.rectangle((13, 11, 15, 13), fill=PAL["ink"])
    d.rectangle((18, 11, 20, 13), fill=PAL["ink"])
    d.rectangle((6, 25, 10, 36), fill=rgba("#d8d0bd"))
    d.rectangle((22, 25, 26, 36), fill=rgba("#d8d0bd"))
    return img


def snow_brazier(kind: str = "gold") -> Image.Image:
    img = canvas(28, 36)
    d = ImageDraw.Draw(img)
    flame = PAL["gold_light"] if kind == "gold" else PAL["cyan"] if kind == "blue" else PAL["green"]
    d.rectangle((8, 22, 20, 33), fill=PAL["outline"])
    d.rectangle((10, 21, 18, 31), fill=rgba("#4c5e78"))
    d.rectangle((6, 31, 22, 35), fill=PAL["stone_deep"])
    d.rectangle((6, 19, 22, 23), fill=PAL["stone_light"])
    d.polygon([(14, 4), (21, 16), (14, 22), (7, 16)], fill=flame)
    d.polygon([(14, 8), (18, 16), (14, 20), (10, 16)], fill=PAL["white"])
    d.rectangle((5, 18, 23, 19), fill=PAL["snow"])
    return img


def campfire_prop(kind: str = "warm") -> Image.Image:
    img = canvas(36, 28)
    d = ImageDraw.Draw(img)
    d.rectangle((7, 21, 29, 25), fill=PAL["shadow"])
    d.line((7, 23, 17, 18, 29, 23), fill=PAL["bark_dark"], width=3)
    d.line((8, 20, 19, 24, 28, 19), fill=PAL["bark"], width=2)
    flame = PAL["cyan"] if kind == "blue" else PAL["green"] if kind == "green" else PAL["orange"]
    core = PAL["white"] if kind != "warm" else PAL["gold_light"]
    d.polygon([(18, 4), (26, 17), (18, 24), (10, 17)], fill=flame)
    d.polygon([(18, 9), (22, 17), (18, 22), (14, 17)], fill=core)
    return img


def tripod_prop(kind: str = "red") -> Image.Image:
    img = canvas(36, 40)
    d = ImageDraw.Draw(img)
    cloth = PAL["red"] if kind == "red" else PAL["blue"] if kind == "blue" else PAL["violet"]
    d.line((18, 4, 7, 37), fill=PAL["bark_dark"], width=3)
    d.line((18, 4, 29, 37), fill=PAL["bark_dark"], width=3)
    d.line((18, 4, 18, 37), fill=PAL["bark"], width=2)
    d.polygon([(18, 8), (28, 30), (8, 30)], fill=PAL["outline"])
    d.polygon([(18, 10), (25, 29), (11, 29)], fill=cloth)
    d.rectangle((15, 20, 21, 21), fill=PAL["gold_light"])
    d.rectangle((16, 12, 20, 14), fill=PAL["gold_light"])
    return img


def rope_gate_prop(kind: str = "wood") -> Image.Image:
    img = canvas(56, 36)
    d = ImageDraw.Draw(img)
    post = PAL["bark"] if kind == "wood" else rgba("#8796a9")
    rope = PAL["bark_dark"] if kind == "wood" else PAL["cyan"]
    for x in (4, 48):
        d.rectangle((x, 7, x + 5, 35), fill=PAL["outline"])
        d.rectangle((x + 1, 6, x + 4, 34), fill=post)
        d.rectangle((x - 2, 4, x + 7, 8), fill=PAL["gold_dark"])
    d.line((8, 15, 28, 21, 51, 15), fill=rope, width=2)
    d.line((8, 24, 28, 30, 51, 24), fill=rope, width=2)
    if kind == "lit":
        for x in (16, 40):
            d.rectangle((x, 16, x + 5, 23), fill=PAL["outline"])
            d.rectangle((x + 1, 17, x + 4, 22), fill=PAL["gold_light"])
    return img


def crate_stack_prop(kind: str = "wood") -> Image.Image:
    img = canvas(40, 36)
    d = ImageDraw.Draw(img)
    trim = PAL["cyan"] if kind == "rune" else PAL["gold_dark"]
    boxes = [(3, 15, 18, 31), (19, 15, 36, 31), (11, 3, 28, 19)]
    for box in boxes:
        x0, y0, x1, y1 = box
        d.rectangle((x0, y0, x1, y1), fill=PAL["outline"])
        d.rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), fill=PAL["bark"])
        d.line((x0 + 3, y0 + 3, x1 - 3, y1 - 3), fill=PAL["bark_dark"], width=1)
        d.rectangle((x0 + 5, y0 + 6, x1 - 5, y0 + 7), fill=trim)
    return img


def barrel_stack_prop(kind: str = "wood") -> Image.Image:
    img = canvas(36, 32)
    d = ImageDraw.Draw(img)
    band = PAL["stone_mid"] if kind == "wood" else PAL["cyan"]
    for x, y in [(3, 9), (17, 9), (10, 2)]:
        d.ellipse((x, y, x + 15, y + 6), fill=PAL["outline"])
        d.rectangle((x, y + 3, x + 15, y + 23), fill=PAL["outline"])
        d.rectangle((x + 2, y + 4, x + 13, y + 22), fill=PAL["bark"])
        d.rectangle((x + 1, y + 10, x + 14, y + 12), fill=band)
        d.rectangle((x + 1, y + 18, x + 14, y + 20), fill=band)
    return img


def crystal_totem_prop(kind: str = "blue") -> Image.Image:
    img = canvas(32, 52)
    d = ImageDraw.Draw(img)
    crystal = PAL["cyan"] if kind == "blue" else PAL["violet"] if kind == "purple" else PAL["green"]
    d.rectangle((10, 30, 22, 48), fill=PAL["stone_deep"])
    d.rectangle((12, 28, 20, 46), fill=rgba("#4c5e78"))
    d.rectangle((6, 46, 26, 51), fill=PAL["stone_deep"])
    d.polygon([(16, 3), (26, 17), (16, 34), (6, 17)], fill=PAL["outline"])
    d.polygon([(16, 5), (24, 17), (16, 31), (8, 17)], fill=crystal)
    d.rectangle((13, 9, 19, 11), fill=PAL["white"])
    d.ellipse((5, 12, 27, 34), outline=crystal, width=1)
    return img


def statue_prop(kind: str = "stone") -> Image.Image:
    img = canvas(36, 56)
    d = ImageDraw.Draw(img)
    stone = rgba("#8796a9") if kind == "stone" else PAL["snow_shadow"]
    accent = PAL["cyan"] if kind == "snow" else PAL["gold_light"]
    d.rectangle((7, 49, 29, 55), fill=PAL["stone_deep"])
    d.rectangle((10, 43, 26, 50), fill=stone)
    d.rectangle((14, 18, 22, 43), fill=PAL["outline"])
    d.rectangle((15, 19, 21, 41), fill=stone)
    d.rectangle((9, 25, 15, 38), fill=PAL["outline"])
    d.rectangle((21, 25, 27, 38), fill=PAL["outline"])
    d.rectangle((12, 7, 24, 19), fill=PAL["outline"])
    d.rectangle((14, 8, 22, 18), fill=stone)
    d.rectangle((16, 12, 20, 13), fill=accent)
    if kind == "snow":
        d.rectangle((10, 6, 25, 8), fill=PAL["snow"])
        d.rectangle((8, 43, 28, 45), fill=PAL["snow"])
    return img


def small_shrine_prop(kind: str = "wood") -> Image.Image:
    img = canvas(36, 42)
    d = ImageDraw.Draw(img)
    roof = PAL["bark_dark"] if kind == "wood" else rgba("#8796a9")
    glow = PAL["gold_light"] if kind == "wood" else PAL["cyan"] if kind == "snow" else PAL["violet"]
    d.rectangle((8, 17, 28, 38), fill=PAL["outline"])
    d.rectangle((10, 18, 26, 36), fill=PAL["bark"] if kind == "wood" else rgba("#4c5e78"))
    d.polygon([(5, 17), (18, 6), (31, 17)], fill=PAL["outline"])
    d.polygon([(8, 16), (18, 8), (28, 16)], fill=roof)
    d.rectangle((15, 23, 21, 33), fill=glow)
    d.rectangle((6, 36, 30, 41), fill=PAL["stone_deep"])
    if kind == "snow":
        d.rectangle((7, 14, 29, 16), fill=PAL["snow"])
    return img


def snow_lamp_stand_prop(kind: str = "blue") -> Image.Image:
    img = canvas(24, 48)
    d = ImageDraw.Draw(img)
    glow = PAL["cyan"] if kind == "blue" else PAL["gold_light"] if kind == "gold" else PAL["violet"]
    d.rectangle((10, 20, 14, 44), fill=PAL["outline"])
    d.rectangle((11, 20, 13, 43), fill=rgba("#8796a9"))
    d.rectangle((5, 42, 19, 47), fill=PAL["stone_deep"])
    d.rectangle((4, 17, 20, 21), fill=PAL["snow"])
    d.rectangle((6, 6, 18, 19), fill=PAL["outline"])
    d.rectangle((8, 8, 16, 17), fill=glow)
    d.rectangle((10, 9, 14, 14), fill=PAL["white"])
    d.rectangle((8, 3, 16, 6), fill=PAL["stone_light"])
    return img


def flower_post_prop(kind: str = "white") -> Image.Image:
    img = canvas(24, 36)
    d = ImageDraw.Draw(img)
    flower = PAL["white"] if kind == "white" else PAL["pink"] if kind == "pink" else PAL["cyan"]
    d.rectangle((11, 11, 13, 34), fill=PAL["bark_dark"])
    d.rectangle((6, 21, 18, 24), fill=PAL["gold_dark"])
    for x, h in [(4, 10), (8, 14), (16, 13), (20, 9)]:
        d.rectangle((x, 34 - h, x + 1, 34), fill=PAL["leaf_mid"])
        d.rectangle((x - 2, 32 - h, x + 2, 36 - h), fill=flower)
    d.polygon([(12, 3), (17, 10), (12, 17), (7, 10)], fill=PAL["outline"])
    d.polygon([(12, 5), (15, 10), (12, 15), (9, 10)], fill=flower)
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
        cropped = resized.crop((left, top, left + w, top + h))
        low = cropped.resize((max(1, w // 2), max(1, h // 2)), Image.Resampling.BOX)
        cropped = low.resize((w, h), Image.Resampling.NEAREST)
        px = cropped.load()
        for yy in range(h):
            depth = yy / max(1, h - 1)
            for xx in range(w):
                r, g, b, a = px[xx, yy]
                avg = (r + g + b) // 3
                r = clamp_channel(int((avg + (r - avg) * 0.82) * (0.58 + depth * 0.12)))
                g = clamp_channel(int((avg + (g - avg) * 0.86) * (0.62 + depth * 0.10)))
                b = clamp_channel(int((avg + (b - avg) * 1.04) * (0.76 + depth * 0.08)))
                if (xx * 13 + yy * 17) % 29 == 0:
                    r, g, b = max(0, r - 18), max(0, g - 18), max(0, b - 18)
                px[xx, yy] = (r, g, b, a)
        return cropped

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
        *platform_component_assets("platforms", "moss"),
        *platform_component_assets("platforms", "stone"),
        *platform_component_assets("platformVariants", "snow"),
        *platform_component_assets("platformVariants", "ice"),
        *platform_component_assets("platformVariants", "summit"),
        *platform_component_assets("platformVariants", "crumble"),
        ("environment/terrainTiles/stone_grass_tile.png", tile_cluster("moss").crop((0, 0, 16, 16))),
        ("environment/snowTiles/snow_cap_tile.png", tile_cluster("snow").crop((0, 0, 16, 16))),
        ("environment/mossTiles/mossy_stone_tile.png", tile_cluster("moss").crop((16, 0, 32, 16))),
        ("environment/ruinTiles/rune_stone_tile.png", tile_cluster("summit").crop((0, 0, 16, 16))),
        ("environment/sheetElements/moss_tile_cluster.png", tile_cluster("moss")),
        ("environment/sheetElements/stone_tile_cluster.png", tile_cluster("stone")),
        ("environment/sheetElements/snow_tile_cluster.png", tile_cluster("snow")),
        ("environment/sheetElements/summit_tile_cluster.png", tile_cluster("summit")),
        ("environment/sheetElements/chain_hanging_long.png", hanging_connector("chain")),
        ("environment/sheetElements/ladder_hanging_long.png", hanging_connector("ladder")),
        ("environment/sheetElements/ice_hanging_column.png", hanging_connector("ice")),
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
        ("environment/pineTrees/round_canopy_tree.png", pixel_tree_variant("round_canopy")),
        ("environment/pineTrees/tall_canopy_tree.png", pixel_tree_variant("tall_canopy")),
        ("environment/pineTrees/forked_oak_tree.png", pixel_tree_variant("forked_oak")),
        ("environment/pineTrees/small_round_tree.png", pixel_tree_variant("small_round")),
        ("environment/pineTrees/sapling_pine_tree.png", pixel_tree_variant("sapling_pine")),
        ("environment/pineTrees/dead_branch_tree.png", pixel_tree_variant("dead_branch")),
        ("environment/pineTrees/wind_bent_leaf_tree.png", pixel_tree_variant("wind_bent_leaf")),
        ("environment/pineTrees/wide_bush_tree.png", pixel_tree_variant("wide_bush_tree")),
        ("environment/pineTrees/autumn_block_tree.png", pixel_tree_variant("autumn_block")),
        ("environment/snowTrees/snow_pine.png", snow_tree("snow")),
        ("environment/snowTrees/frosted_bent_pine.png", snow_tree("bent")),
        ("environment/vegetation/stump_1.png", stump()),
        ("environment/vegetation/mushroom_cluster_1.png", mushroom_cluster()),
        ("environment/vegetation/moss_patch_1.png", platform(24, 10, "moss")),
        ("environment/vegetation/vine_hanging_1.png", vine()),
        ("environment/vegetation/pebble_cluster_1.png", pebbles()),
        ("environment/rocks/stone_cap_1.png", stone_cap("cloud")),
        ("environment/rocks/stone_cap_pine_1.png", stone_cap("pine")),
        ("environment/rocks/stone_cap_cloud_1.png", stone_cap("cloud")),
        ("environment/rocks/stone_cap_snow_1.png", stone_cap("snow")),
        ("environment/rocks/stone_cap_ice_1.png", stone_cap("ice")),
        ("environment/rocks/stone_cap_summit_1.png", stone_cap("summit")),
        ("environment/rocks/rock_cluster_plain_1.png", rock_cluster("plain")),
        ("environment/rocks/rock_cluster_moss_1.png", rock_cluster("moss")),
        ("environment/rocks/rock_cluster_pine_1.png", rock_cluster("pine")),
        ("environment/rocks/rock_cluster_cloud_1.png", rock_cluster("cloud")),
        ("environment/rocks/rock_cluster_snow_1.png", rock_cluster("snow")),
        ("environment/rocks/rock_cluster_ice_1.png", rock_cluster("ice")),
        ("environment/rocks/rock_cluster_summit_1.png", rock_cluster("summit")),
        ("environment/rocks/rock_spire_1.png", rock_cluster("tall")),
        ("environment/rocks/rock_single_small_1.png", rock_cluster("small")),
        ("environment/rocks/rock_single_medium_1.png", rock_cluster("medium")),
        ("environment/rocks/rock_single_large_1.png", rock_cluster("large")),
        ("environment/rocks/rock_slab_flat_1.png", rock_cluster("slab")),
        ("environment/rocks/rock_stack_plain_1.png", rock_cluster("stack")),
        ("environment/rocks/rock_stack_snow_1.png", rock_cluster("stack_snow")),
        ("environment/rocks/rock_stack_moss_1.png", rock_cluster("stack_moss")),
        ("environment/rocks/rock_stack_cloud_1.png", rock_cluster("stack_cloud")),
        ("environment/rocks/rock_stack_ice_1.png", rock_cluster("stack_ice")),
        ("environment/rocks/rock_stack_summit_1.png", rock_cluster("stack_summit")),
        ("environment/rocks/rock_spire_snow_1.png", rock_cluster("spire_snow")),
        ("environment/rocks/rock_spire_moss_1.png", rock_cluster("spire_moss")),
        ("environment/rocks/rock_spire_cloud_1.png", rock_cluster("spire_cloud")),
        ("environment/rocks/rock_spire_ice_1.png", rock_cluster("spire_ice")),
        ("environment/rocks/rock_spire_summit_1.png", rock_cluster("spire_summit")),
        ("environment/rocks/rock_rubble_small_1.png", rock_cluster("rubble")),
        ("environment/rocks/rock_rubble_wall_1.png", rock_cluster("rubble_wall")),
        ("environment/rocks/rock_moss_boulder_large_1.png", rock_cluster("moss_boulder_large")),
        ("environment/rocks/rock_moss_boulder_small_1.png", rock_cluster("moss_boulder_small")),
        ("environment/flora/reed_grass_wheat_1.png", reed_grass("wheat")),
        ("environment/flora/reed_grass_yellow_1.png", reed_grass("yellow")),
        ("environment/flora/flower_pink_1.png", reed_grass("pink")),
        ("environment/flora/wildflower_mixed_1.png", wildflower_patch("mixed")),
        ("environment/flora/wildflower_pink_1.png", wildflower_patch("pink")),
        ("environment/flora/wildflower_yellow_1.png", wildflower_patch("yellow")),
        ("environment/hazards/spikes_1.png", spikes("stone")),
        ("environment/hazards/stone_spikes_1.png", spikes("stone")),
        ("environment/hazards/ice_spikes_1.png", spikes("ice")),
        ("environment/hazards/summit_spikes_1.png", spikes("summit")),
        ("environment/hazards/crystal_spikes_1.png", crystal_spikes("blue")),
        ("environment/hazards/crystal_spikes_blue_1.png", crystal_spikes("blue")),
        ("environment/hazards/crystal_spikes_green_1.png", crystal_spikes("green")),
        ("environment/hazards/crystal_spikes_purple_1.png", crystal_spikes("purple")),
        ("environment/hazards/thorn_vine_1.png", thorn_vine()),
        ("environment/hazards/falling_icicle_1.png", icicle("single")),
        ("environment/hazards/falling_icicles_cluster_1.png", icicle("cluster")),
        ("environment/hazards/wind_zone_1.png", wind_ribbon("ice")),
        ("environment/hazards/magic_wind_purple_1.png", wind_ribbon("purple")),
        ("environment/hazards/magic_wind_green_1.png", wind_ribbon("green")),
        ("environment/hazards/lightning_1.png", lightning_bolt("gold")),
        ("environment/hazards/lightning_blue_1.png", lightning_bolt("blue")),
        ("environment/hazards/lightning_purple_1.png", lightning_bolt("purple")),
        ("environment/hazards/rolling_boulder_1.png", rolling_boulder("plain")),
        ("environment/hazards/rolling_boulder_rune_1.png", rolling_boulder("rune")),
        ("environment/hazards/spike_boulder_1.png", spike_boulder()),
        ("environment/hazards/spike_machine_1.png", spike_machine()),
        ("environment/hazards/spike_ball_1.png", spike_ball()),
        ("environment/hazards/magic_arc_purple_1.png", magic_arc("purple")),
        ("environment/hazards/magic_arc_blue_1.png", magic_arc("blue")),
        ("environment/hazards/rune_trap_green_1.png", rune_trap("green")),
        ("environment/hazards/rune_trap_gold_1.png", rune_trap("gold")),
        ("environment/lights/lantern_cyan_1.png", lantern(PAL["cyan"])),
        ("environment/lights/lantern_gold_1.png", lantern(PAL["gold_light"])),
        ("environment/lights/torch_1.png", torch()),
        ("environment/lights/lamp_post_1.png", lantern(PAL["gold_light"], post=True)),
        ("environment/lanterns/wood_lantern.png", lantern(PAL["gold_light"])),
        ("environment/lanterns/crystal_lantern.png", lantern(PAL["cyan"])),
        ("environment/decorations/banner_blue_large.png", banner_stand(PAL["blue"], "rune")),
        ("environment/decorations/banner_gold_large.png", banner_stand(PAL["gold_light"], "crown")),
        ("environment/decorations/banner_green_large.png", banner_stand(PAL["green"], "rune")),
        ("environment/decorations/hanging_lantern_blue.png", hanging_lantern("blue")),
        ("environment/decorations/hanging_lantern_gold.png", hanging_lantern("gold")),
        ("environment/decorations/hanging_lantern_green.png", hanging_lantern("green")),
        ("environment/decorations/pedestal_lamp_blue.png", pedestal_lamp("blue")),
        ("environment/decorations/pedestal_lamp_green.png", pedestal_lamp("green")),
        ("environment/decorations/pedestal_lamp_gold.png", pedestal_lamp("gold")),
        ("environment/decorations/sign_board_wood.png", sign_board("wood")),
        ("environment/decorations/sign_board_rune.png", sign_board("rune")),
        ("environment/decorations/rope_posts_plain.png", rope_posts("plain")),
        ("environment/decorations/rope_posts_lanterns.png", rope_posts("lanterns")),
        ("environment/decorations/flower_crystal_blue.png", flower_crystal_cluster("blue")),
        ("environment/decorations/flower_crystal_green.png", flower_crystal_cluster("green")),
        ("environment/decorations/flower_crystal_purple.png", flower_crystal_cluster("purple")),
        ("environment/decorations/skeleton_marker.png", skeleton_marker()),
        ("environment/decorations/snow_brazier_gold.png", snow_brazier("gold")),
        ("environment/decorations/snow_brazier_blue.png", snow_brazier("blue")),
        ("environment/decorations/snow_brazier_green.png", snow_brazier("green")),
        ("environment/decorations/campfire_warm.png", campfire_prop("warm")),
        ("environment/decorations/campfire_blue.png", campfire_prop("blue")),
        ("environment/decorations/campfire_green.png", campfire_prop("green")),
        ("environment/decorations/tripod_red.png", tripod_prop("red")),
        ("environment/decorations/tripod_blue.png", tripod_prop("blue")),
        ("environment/decorations/tripod_purple.png", tripod_prop("purple")),
        ("environment/decorations/rope_gate_wood.png", rope_gate_prop("wood")),
        ("environment/decorations/rope_gate_lit.png", rope_gate_prop("lit")),
        ("environment/decorations/rope_gate_ice.png", rope_gate_prop("ice")),
        ("environment/decorations/crate_stack_wood.png", crate_stack_prop("wood")),
        ("environment/decorations/crate_stack_rune.png", crate_stack_prop("rune")),
        ("environment/decorations/barrel_stack_wood.png", barrel_stack_prop("wood")),
        ("environment/decorations/barrel_stack_rune.png", barrel_stack_prop("rune")),
        ("environment/decorations/crystal_totem_blue.png", crystal_totem_prop("blue")),
        ("environment/decorations/crystal_totem_green.png", crystal_totem_prop("green")),
        ("environment/decorations/crystal_totem_purple.png", crystal_totem_prop("purple")),
        ("environment/decorations/statue_stone.png", statue_prop("stone")),
        ("environment/decorations/statue_snow.png", statue_prop("snow")),
        ("environment/decorations/small_shrine_wood.png", small_shrine_prop("wood")),
        ("environment/decorations/small_shrine_snow.png", small_shrine_prop("snow")),
        ("environment/decorations/small_shrine_purple.png", small_shrine_prop("purple")),
        ("environment/decorations/snow_lamp_blue.png", snow_lamp_stand_prop("blue")),
        ("environment/decorations/snow_lamp_gold.png", snow_lamp_stand_prop("gold")),
        ("environment/decorations/snow_lamp_purple.png", snow_lamp_stand_prop("purple")),
        ("environment/decorations/flower_post_white.png", flower_post_prop("white")),
        ("environment/decorations/flower_post_pink.png", flower_post_prop("pink")),
        ("environment/decorations/flower_post_blue.png", flower_post_prop("blue")),
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
        ("environment/ladders/frosted_wood_ladder.png", hanging_connector("ladder")),
        ("environment/ladders/climbing_chain.png", hanging_connector("chain")),
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
        ("environment/enemies/goblin_scout_1.png", enemy("goblin_scout")),
        ("environment/enemies/goblin_chief_1.png", enemy("goblin_chief")),
        ("environment/enemies/goblin_dark_1.png", enemy("goblin_dark")),
        ("environment/enemies/archer_1.png", enemy("archer")),
        ("environment/enemies/archer_dark_1.png", enemy("archer_dark")),
        ("environment/enemies/archer_bone_1.png", enemy("archer_bone")),
        ("environment/enemies/ice_bat_1.png", enemy("ice_bat")),
        ("environment/enemies/ice_bat_frost_1.png", enemy("ice_bat_frost")),
        ("environment/enemies/skull_bat_1.png", enemy("skull_bat")),
        ("environment/enemies/skeleton_1.png", enemy("skeleton")),
        ("environment/enemies/skeleton_dark_1.png", enemy("skeleton_dark")),
        ("environment/enemies/skeleton_armored_1.png", enemy("skeleton_armored")),
        ("environment/enemies/skeleton_mage_1.png", enemy("skeleton_mage")),
        ("environment/enemies/yeti_1.png", enemy("yeti")),
        ("environment/enemies/ice_golem_1.png", enemy("ice_golem")),
        ("environment/enemies/armored_brute_1.png", enemy("armored_brute")),
        ("environment/enemies/wind_spirit_1.png", enemy("wind_spirit")),
        ("environment/enemies/portal_blue_1.png", enemy("portal_blue")),
        ("environment/ui/crown_1.png", crown()),
        ("environment/ui/height_arrow_1.png", height_arrow()),
        ("environment/ui/hud_panel_1.png", hud_panel()),
    ]

    for biome in ("pine", "cloud", "snow", "frozen", "summit"):
        for role in ("cap", "body", "left", "right", "bottom"):
            assets.append((f"environment/midMountains/{biome}_{role}.png", mid_mountain_tile(biome, role)))

    for i, width in enumerate((10, 6, 2, 6), 1):
        assets.append((f"environment/collectibles/coin_spin_frame{i}.png", coin(width)))
    assets.append(("environment/collectibles/coin_1.png", coin(10)))
    for name, color, glow in [
        ("coin_gold_1", PAL["gold"], PAL["gold_light"]),
        ("coin_silver_1", rgba("#cfd8e3"), PAL["white"]),
        ("coin_copper_1", rgba("#c47a3a"), rgba("#ffd0a0")),
        ("coin_rune_blue_1", PAL["cyan"], PAL["cyan_light"]),
        ("coin_rune_purple_1", PAL["violet"], rgba("#e6d8ff")),
    ]:
        assets.append((f"environment/collectibles/{name}.png", coin_variant(color, glow)))
    for i, c in enumerate(((PAL["cyan"], PAL["cyan_light"], PAL["cyan_dark"]), (PAL["red"], PAL["orange"], PAL["stone_deep"]), (PAL["green"], PAL["white"], PAL["leaf_dark"]), (PAL["violet"], PAL["white"], PAL["ink"])), 1):
        assets.append((f"environment/collectibles/gem_variant{i}.png", gem(*c)))
    for name, c in [
        ("gem_red_1", (PAL["red"], PAL["orange"], PAL["stone_deep"])),
        ("gem_blue_1", (PAL["cyan"], PAL["cyan_light"], PAL["cyan_dark"])),
        ("gem_green_1", (PAL["green"], PAL["white"], PAL["leaf_dark"])),
        ("gem_purple_1", (PAL["violet"], PAL["white"], PAL["ink"])),
        ("gem_gold_1", (PAL["gold"], PAL["gold_light"], PAL["gold_dark"])),
    ]:
        assets.append((f"environment/collectibles/{name}.png", gem(*c)))
    for i in range(4):
        assets.append((f"environment/collectibles/seed_green_frame{i + 1}.png", seed(i)))
        assets.append((f"environment/collectibles/star_shard_frame{i + 1}.png", star_shard(i)))
        assets.append((f"environment/collectibles/relic_pink_frame{i + 1}.png", relic(i)))
        assets.append((f"environment/collectibles/magic_orb_blue_frame{i + 1}.png", magic_orb(PAL["cyan"], i)))
        assets.append((f"environment/collectibles/magic_orb_gold_frame{i + 1}.png", magic_orb(PAL["gold_light"], i)))
        assets.append((f"environment/collectibles/magic_orb_purple_frame{i + 1}.png", magic_orb(PAL["violet"], i)))
        assets.append((f"environment/collectibles/elemental_burst_fire_frame{i + 1}.png", elemental_burst(PAL["orange"], i)))
        assets.append((f"environment/collectibles/elemental_burst_ice_frame{i + 1}.png", elemental_burst(PAL["cyan_light"], i)))
        assets.append((f"environment/collectibles/medallion_green_frame{i + 1}.png", medallion(PAL["green"], i)))
        assets.append((f"environment/collectibles/medallion_gold_frame{i + 1}.png", medallion(PAL["gold"], i)))
        assets.append((f"environment/collectibles/relic_pedestal_blue_frame{i + 1}.png", relic_pedestal(PAL["cyan"], i)))
        assets.append((f"environment/collectibles/relic_pedestal_fire_frame{i + 1}.png", relic_pedestal(PAL["orange"], i)))
    assets.extend([
        ("environment/collectibles/heart_1.png", heart()),
        ("environment/collectibles/crown_gold_1.png", crown_collectible(PAL["gold"])),
        ("environment/collectibles/crown_blue_1.png", crown_collectible(PAL["cyan"])),
        ("environment/collectibles/magic_orb_blue_1.png", magic_orb(PAL["cyan"])),
        ("environment/collectibles/magic_orb_gold_1.png", magic_orb(PAL["gold_light"])),
        ("environment/collectibles/magic_orb_purple_1.png", magic_orb(PAL["violet"])),
        ("environment/collectibles/potion_blue_1.png", potion(PAL["cyan"])),
        ("environment/collectibles/potion_red_1.png", potion(PAL["red"])),
        ("environment/collectibles/potion_gold_1.png", potion(PAL["gold_light"])),
        ("environment/collectibles/exp_badge_1.png", exp_badge()),
        ("environment/collectibles/treasure_chest_1.png", treasure_chest()),
        ("environment/collectibles/treasure_chest_blue_1.png", treasure_chest("blue")),
        ("environment/collectibles/treasure_chest_red_1.png", treasure_chest("red")),
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


def _rock_theme(variant: str = "plain") -> str:
    if any(token in variant for token in ("moss", "pine")):
        return "pine"
    if "snow" in variant:
        return "snow"
    if "ice" in variant:
        return "ice"
    if "summit" in variant:
        return "summit"
    if "cloud" in variant or variant in {"plain", "tall", "small", "medium", "large", "slab", "stack", "rubble", "rubble_wall"}:
        return "cloud"
    return "cloud"


def _rock_colors(variant: str = "plain") -> dict[str, tuple[int, int, int, int]]:
    theme = _rock_theme(variant)
    if theme == "pine":
        return {
            "outline": rgba("#080f0b"),
            "dark": rgba("#203129"),
            "mid": rgba("#3f4f43"),
            "light": rgba("#708064"),
            "hot": rgba("#9fb66b"),
            "crack": rgba("#142019"),
            "accent": rgba("#75b64b"),
            "glow": rgba("#c5df7d"),
        }
    if theme == "snow":
        return {
            "outline": rgba("#091321"),
            "dark": rgba("#24374d"),
            "mid": rgba("#536b80"),
            "light": rgba("#9eb3c5"),
            "hot": rgba("#f4fbff"),
            "crack": rgba("#17283d"),
            "accent": rgba("#d8f6ff"),
            "glow": rgba("#ffffff"),
        }
    if theme == "ice":
        return {
            "outline": rgba("#06101e"),
            "dark": rgba("#14314d"),
            "mid": rgba("#285d7e"),
            "light": rgba("#59a7c7"),
            "hot": rgba("#c8fbff"),
            "crack": rgba("#0b2238"),
            "accent": rgba("#42e7ff"),
            "glow": rgba("#effcff"),
        }
    if theme == "summit":
        return {
            "outline": rgba("#11121e"),
            "dark": rgba("#2d324d"),
            "mid": rgba("#59617d"),
            "light": rgba("#a5afbd"),
            "hot": rgba("#f4f8ff"),
            "crack": rgba("#252940"),
            "accent": rgba("#d7a847"),
            "glow": rgba("#fff0a6"),
        }
    return {
        "outline": rgba("#0b1320"),
        "dark": rgba("#26364a"),
        "mid": rgba("#4f6177"),
        "light": rgba("#8ca0b3"),
        "hot": rgba("#d6e2ed"),
        "crack": rgba("#172436"),
        "accent": rgba("#71d6df"),
        "glow": rgba("#e7f7ff"),
    }


def _draw_faceted_rock(
    d: ImageDraw.ImageDraw,
    pts: list[tuple[int, int]],
    colors: dict[str, tuple[int, int, int, int]],
    *,
    theme: str = "cloud",
) -> None:
    xs = [x for x, _ in pts]
    ys = [y for _, y in pts]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    w = max(1, x1 - x0)

    d.polygon([(x + 1, y + 2) for x, y in pts], fill=colors["outline"])
    d.polygon(pts, fill=colors["mid"])
    d.polygon(
        [(x0 + max(2, w // 9), y0 + 2), (x0 + w // 2, y0 + 1), (x1 - 3, y0 + max(4, (y1 - y0) // 3)), (x0 + w // 3, y0 + max(6, (y1 - y0) // 2))],
        fill=colors["light"],
    )
    d.polygon([(x1 - w // 3, y0 + 6), (x1 - 2, y0 + 10), (x1 - 4, y1 - 3), (x0 + w // 2, y1 - 2)], fill=colors["dark"])
    d.line((x0 + 4, y0 + 7, x0 + w // 2, y0 + 12, x1 - 5, y1 - 6), fill=colors["crack"], width=2)
    if theme in {"snow", "ice"}:
        d.polygon([(x0 + 2, y0 + 1), (x0 + w // 2, y0), (x1 - 4, y0 + 3), (x1 - 7, y0 + 6), (x0 + 5, y0 + 5)], fill=colors["hot"])
        d.rectangle((x0 + 5, y0 + 5, x0 + 8, y0 + 8), fill=colors["hot"])
        d.rectangle((x1 - 10, y0 + 4, x1 - 7, y0 + 7), fill=colors["hot"])
        if theme == "ice":
            d.line((x0 + w // 2, y0 + 4, x0 + w // 2 - 3, y0 + 13, x0 + w // 2 + 5, y1 - 5), fill=colors["accent"], width=1)
            d.point((x0 + w // 2 + 1, y0 + 6), fill=colors["glow"])
    if theme == "pine":
        d.rectangle((x0 + 1, y1 - 7, x1 - 2, y1 - 3), fill=colors["dark"])
        d.rectangle((x0 + 3, y1 - 8, x0 + w // 2, y1 - 6), fill=colors["accent"])
        for x in (x0 + 4, x0 + w // 2, x1 - 7):
            d.rectangle((x, y1 - 4, x + 2, y1 + 1), fill=colors["dark"])
    if theme == "cloud":
        d.rectangle((x0 + 3, y0 + 3, x0 + 6, y0 + 4), fill=colors["accent"])
        d.point((x1 - 7, y0 + 8), fill=colors["glow"])
    if theme == "summit":
        d.rectangle((x0 + w // 2 - 1, y0 + 4, x0 + w // 2 + 1, y0 + 6), fill=colors["accent"])
        d.point((x0 + w // 2, y0 + 5), fill=colors["glow"])
        d.line((x1 - 8, y0 + 6, x1 - 11, y1 - 7), fill=colors["accent"], width=1)


def rock_cluster(variant: str = "plain") -> Image.Image:
    wall_like = variant in {"wall", "rubble_wall"}
    img = canvas(48, 48 if wall_like else 32)
    d = ImageDraw.Draw(img)
    colors = _rock_colors(variant)
    theme = _rock_theme(variant)

    if wall_like:
        d.rectangle((3, 5, 44, 43), fill=colors["outline"])
        tile_boxes = [
            (5, 7, 16, 17), (18, 6, 30, 17), (32, 8, 42, 18),
            (6, 19, 20, 29), (22, 18, 34, 29), (35, 20, 43, 30),
            (4, 31, 17, 41), (19, 30, 31, 42), (33, 32, 43, 41),
        ]
        for i, box in enumerate(tile_boxes):
            fill = colors["mid"] if i % 3 else colors["dark"]
            d.rectangle(box, fill=fill)
            d.rectangle((box[0] + 1, box[1] + 1, box[2] - 3, box[1] + 3), fill=colors["light"])
            if theme in {"ice", "snow"} and i % 2 == 0:
                d.rectangle((box[0] + 2, box[1], box[2] - 4, box[1] + 1), fill=colors["hot"])
            if theme == "summit" and i % 4 == 0:
                d.point((box[0] + 4, box[1] + 5), fill=colors["glow"])
        return img

    shadow_width = 18 if variant == "small" else 34 if variant in {"medium", "slab"} else 41
    d.rectangle(((48 - shadow_width) // 2, 27, (48 + shadow_width) // 2, 30), fill=PAL["shadow"])

    if variant == "small":
        shapes = [[(15, 24), (20, 14), (30, 13), (35, 20), (32, 28), (19, 28)]]
    elif variant == "medium":
        shapes = [[(9, 25), (16, 12), (31, 8), (42, 17), (39, 28), (18, 29)]]
    elif variant == "large":
        shapes = [[(5, 26), (12, 12), (25, 5), (39, 10), (46, 20), (40, 29), (13, 29)]]
    elif variant == "slab":
        shapes = [[(6, 25), (11, 16), (27, 13), (43, 17), (44, 25), (33, 29), (11, 29)]]
    elif variant in {"stack", "stack_snow", "stack_moss", "stack_cloud", "stack_ice", "stack_summit"}:
        shapes = [
            [(5, 24), (12, 16), (22, 18), (21, 29), (8, 29)],
            [(14, 17), (21, 8), (32, 7), (38, 17), (32, 25), (18, 25)],
            [(29, 21), (38, 14), (45, 20), (42, 29), (30, 29)],
            [(3, 22), (8, 18), (14, 23), (11, 29), (4, 29)],
        ]
    elif variant in {"tall", "spire", "spire_snow", "spire_moss", "spire_cloud", "spire_ice", "spire_summit"}:
        shapes = [
            [(6, 28), (15, 10), (22, 3), (25, 28)],
            [(20, 28), (31, 2), (39, 14), (42, 29)],
            [(5, 28), (17, 20), (27, 28)],
        ]
    elif variant == "rubble":
        shapes = [
            [(5, 27), (10, 22), (16, 24), (15, 29), (7, 29)],
            [(17, 26), (23, 19), (31, 22), (30, 29), (19, 29)],
            [(32, 27), (37, 22), (44, 24), (42, 29), (33, 29)],
            [(12, 20), (16, 16), (21, 18), (20, 23), (14, 23)],
        ]
    elif variant == "moss_boulder_large":
        shapes = [[(4, 26), (10, 13), (25, 4), (41, 10), (46, 22), (39, 29), (12, 29)]]
    elif variant == "moss_boulder_small":
        shapes = [[(12, 25), (18, 14), (31, 12), (39, 21), (35, 29), (18, 29)]]
    else:
        shapes = [
            [(5, 23), (11, 14), (19, 17), (20, 27), (9, 28)],
            [(14, 15), (21, 7), (31, 10), (33, 24), (22, 28), (14, 25)],
            [(28, 18), (38, 12), (45, 19), (42, 28), (30, 28)],
            [(2, 22), (7, 18), (13, 22), (11, 29), (4, 29)],
        ]

    for pts in shapes:
        _draw_faceted_rock(d, pts, colors, theme=theme)
    return img


def stone_cap(variant: str = "cloud") -> Image.Image:
    img = canvas(24, 16)
    d = ImageDraw.Draw(img)
    colors = _rock_colors(variant)
    theme = _rock_theme(variant)
    d.rectangle((4, 12, 21, 14), fill=PAL["shadow"])
    d.polygon([(2, 11), (6, 5), (17, 3), (22, 7), (20, 13), (6, 14)], fill=colors["outline"])
    d.polygon([(3, 10), (7, 5), (17, 4), (21, 7), (19, 12), (6, 13)], fill=colors["mid"])
    d.polygon([(6, 5), (17, 4), (20, 7), (15, 9), (6, 9)], fill=colors["hot"] if theme in {"snow", "ice"} else colors["light"])
    d.rectangle((7, 9, 10, 11), fill=colors["light"])
    d.rectangle((16, 8, 19, 10), fill=colors["light"])
    if theme == "pine":
        d.rectangle((4, 11, 18, 13), fill=colors["dark"])
        d.rectangle((6, 10, 14, 11), fill=colors["accent"])
    if theme == "ice":
        d.line((13, 5, 11, 11), fill=colors["accent"], width=1)
    if theme == "summit":
        d.point((12, 7), fill=colors["glow"])
        d.line((17, 7, 15, 11), fill=colors["accent"], width=1)
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


def crystal_spikes(color: str = "blue") -> Image.Image:
    img = canvas(32, 28)
    d = ImageDraw.Draw(img)
    colors = {
        "blue": (PAL["cyan_dark"], PAL["cyan"], PAL["cyan_light"]),
        "green": (rgba("#174a35"), rgba("#48d86f"), rgba("#d8ffe8")),
        "purple": (rgba("#34205a"), rgba("#9a5aff"), rgba("#e6d8ff")),
    }[color]
    d.rectangle((2, 24, 29, 27), fill=rgba("#26354a"))
    for x, h in [(2, 13), (8, 22), (16, 16), (22, 24)]:
        d.polygon([(x, 25), (x + 4, 25 - h), (x + 9, 25)], fill=colors[0])
        d.polygon([(x + 2, 24), (x + 5, 27 - h), (x + 7, 24)], fill=colors[1])
        d.line((x + 5, 25 - h, x + 5, 21), fill=colors[2])
    return img


def icicle(kind: str = "single") -> Image.Image:
    img = canvas(48 if kind == "cluster" else 24, 36)
    d = ImageDraw.Draw(img)
    width = img.width
    d.rectangle((0, 0, width - 1, 6), fill=rgba("#26354a"))
    d.rectangle((1, 0, width - 2, 4), fill=PAL["snow_shadow"])
    d.rectangle((4, 0, width - 6, 2), fill=PAL["snow"])
    xs = [(7, 29), (16, 20)] if kind == "single" else [(4, 21), (12, 34), (23, 26), (33, 31), (41, 18)]
    for x, h in xs:
        d.polygon([(x, 5), (x + 4, h), (x + 8, 5)], fill=PAL["cyan_dark"])
        d.polygon([(x + 1, 5), (x + 4, h - 3), (x + 6, 5)], fill=PAL["snow"])
        d.line((x + 5, 7, x + 4, h - 6), fill=PAL["cyan_light"], width=1)
    return img


def rolling_boulder(kind: str = "plain") -> Image.Image:
    img = canvas(34, 34)
    d = ImageDraw.Draw(img)
    body = rgba("#7a808b") if kind == "plain" else rgba("#4f5868")
    hi = rgba("#cfd4dc") if kind == "plain" else rgba("#9bb8cf")
    d.ellipse((2, 5, 31, 32), fill=PAL["stone_deep"])
    d.ellipse((4, 3, 30, 29), fill=body)
    for box in [(8, 8, 15, 13), (17, 6, 25, 12), (8, 19, 18, 25), (21, 18, 27, 24)]:
        d.rectangle(box, fill=hi)
    d.line((8, 15, 25, 24), fill=rgba("#323848"), width=2)
    d.line((15, 7, 12, 25), fill=rgba("#323848"), width=1)
    if kind == "rune":
        d.rectangle((15, 14, 20, 15), fill=PAL["cyan"])
        d.rectangle((17, 11, 18, 19), fill=PAL["cyan_light"])
    return img


def lightning_bolt(color: str = "gold") -> Image.Image:
    img = canvas(28, 42)
    d = ImageDraw.Draw(img)
    bolt = PAL["gold_light"] if color == "gold" else PAL["cyan_light"] if color == "blue" else rgba("#b978ff")
    core = PAL["white"]
    d.polygon([(15, 0), (4, 21), (13, 19), (8, 41), (24, 13), (15, 15)], fill=core)
    d.polygon([(15, 3), (8, 18), (17, 16), (12, 34), (21, 14), (14, 16)], fill=bolt)
    return img


def wind_ribbon(color: str = "ice") -> Image.Image:
    img = canvas(64, 24)
    d = ImageDraw.Draw(img)
    line = rgba("#d8f6ff", 150) if color == "ice" else rgba("#e8d8ff", 150) if color == "purple" else rgba("#d8ffe0", 150)
    for y, a in [(5, 110), (11, 150), (17, 95)]:
        d.line((0, y, 18, y - 4, 38, y + 2, 63, y - 2), fill=line[:3] + (a,), width=2)
    for x, y in [(12, 4), (44, 12), (55, 18)]:
        d.rectangle((x, y, x + 2, y + 2), fill=PAL["snow"])
    return img


def spike_machine() -> Image.Image:
    img = canvas(40, 32)
    d = ImageDraw.Draw(img)
    d.rectangle((8, 4, 31, 24), fill=PAL["outline"])
    d.rectangle((11, 6, 28, 22), fill=rgba("#4c5e78"))
    d.rectangle((18, 0, 21, 31), fill=rgba("#b48a52"))
    d.rectangle((1, 14, 38, 18), fill=PAL["outline"])
    d.rectangle((3, 15, 36, 17), fill=rgba("#b48a52"))
    d.rectangle((16, 12, 23, 18), fill=PAL["gold_light"])
    for x, y in [(5, 5), (30, 5), (5, 23), (30, 23)]:
        d.rectangle((x, y, x + 5, y + 5), fill=PAL["outline"])
        d.rectangle((x + 1, y + 1, x + 4, y + 4), fill=rgba("#cfd4dc"))
    return img


def spike_ball() -> Image.Image:
    img = canvas(32, 32)
    d = ImageDraw.Draw(img)
    cx, cy = 16, 16
    for x, y in [(16, 1), (16, 31), (1, 16), (31, 16), (5, 5), (27, 5), (5, 27), (27, 27)]:
        d.line((cx, cy, x, y), fill=rgba("#9ba6b3"), width=2)
    d.ellipse((6, 6, 26, 26), fill=PAL["outline"])
    d.ellipse((8, 8, 24, 24), fill=rgba("#59646f"))
    d.rectangle((12, 10, 18, 12), fill=rgba("#cfd4dc"))
    return img


def spike_boulder() -> Image.Image:
    img = rolling_boulder("plain")
    d = ImageDraw.Draw(img)
    for x, y in [(16, 0), (29, 9), (31, 22), (16, 33), (4, 24), (2, 10)]:
        d.polygon([(16, 17), (x, y), (max(0, x - 3), min(33, y + 3))], fill=rgba("#cfd4dc"))
    return img


def magic_arc(color: str = "purple") -> Image.Image:
    img = canvas(64, 24)
    d = ImageDraw.Draw(img)
    col = {"purple": rgba("#a45cff"), "blue": PAL["cyan"], "green": rgba("#74ff8d"), "gold": PAL["gold_light"]}[color]
    hi = {"purple": rgba("#f0d8ff"), "blue": PAL["cyan_light"], "green": rgba("#e2ffe6"), "gold": PAL["white"]}[color]
    for i in range(0, 64, 8):
        y = 12 + (4 if (i // 8) % 2 else -4)
        d.line((i, 12, i + 8, y), fill=col, width=2)
        d.rectangle((i + 3, y - 1, i + 5, y + 1), fill=hi)
    return img


def rune_trap(color: str = "green") -> Image.Image:
    img = canvas(40, 32)
    d = ImageDraw.Draw(img)
    col = {"green": rgba("#7cff70"), "gold": PAL["gold_light"], "blue": PAL["cyan"], "purple": rgba("#a45cff")}[color]
    hi = {"green": rgba("#e2ffe6"), "gold": PAL["white"], "blue": PAL["cyan_light"], "purple": rgba("#f0d8ff")}[color]
    d.ellipse((7, 3, 33, 29), outline=col, width=2)
    d.ellipse((13, 9, 27, 23), outline=col, width=1)
    d.line((20, 1, 20, 31), fill=col, width=1)
    d.line((4, 16, 36, 16), fill=col, width=1)
    d.rectangle((18, 14, 22, 18), fill=hi)
    for x, y in [(20, 2), (34, 16), (20, 30), (6, 16)]:
        d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=hi)
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


def magic_orb(color: tuple[int, int, int, int], frame: int = 0) -> Image.Image:
    img = canvas(20, 20)
    d = ImageDraw.Draw(img)
    d.ellipse((1, 1, 18, 18), fill=color[:3] + (70,))
    d.ellipse((4, 4, 15, 15), fill=PAL["outline"])
    d.ellipse((5, 5, 14, 14), fill=color)
    d.rectangle((8, 3 + frame % 2, 11, 5 + frame % 2), fill=PAL["white"])
    d.arc((2, 2, 17, 17), 25 + frame * 18, 155 + frame * 18, fill=PAL["white"], width=1)
    return img


def elemental_burst(color: tuple[int, int, int, int], frame: int = 0) -> Image.Image:
    img = canvas(24, 24)
    d = ImageDraw.Draw(img)
    cx = cy = 12
    for a in range(0, 360, 45):
        rad = math.radians(a + frame * 12)
        x = cx + int(math.cos(rad) * 10)
        y = cy + int(math.sin(rad) * 10)
        d.line((cx, cy, x, y), fill=color, width=2)
        d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=PAL["white"])
    d.ellipse((7, 7, 17, 17), fill=PAL["outline"])
    d.ellipse((9, 9, 15, 15), fill=color)
    return img


def medallion(color: tuple[int, int, int, int], frame: int = 0) -> Image.Image:
    img = canvas(24, 24)
    d = ImageDraw.Draw(img)
    dark = tuple(max(0, c - 75) for c in color[:3]) + (255,)
    d.ellipse((3, 4, 21, 22), fill=PAL["outline"])
    d.ellipse((5, 5, 19, 20), fill=dark)
    d.ellipse((7, 7, 17, 18), fill=color)
    d.rectangle((10, 1, 14, 5), fill=PAL["gold_dark"])
    d.rectangle((8, 11, 16, 12), fill=PAL["white"])
    d.rectangle((11, 8, 12, 16), fill=PAL["white"])
    if frame % 2:
        d.rectangle((5, 4, 8, 6), fill=PAL["white"])
    return img


def relic_pedestal(color: tuple[int, int, int, int], frame: int = 0) -> Image.Image:
    img = canvas(32, 40)
    d = ImageDraw.Draw(img)
    d.rectangle((9, 25, 23, 37), fill=PAL["outline"])
    d.rectangle((11, 23, 21, 35), fill=rgba("#4c5e78"))
    d.rectangle((6, 35, 26, 39), fill=PAL["outline"])
    d.rectangle((8, 33, 24, 36), fill=rgba("#8a95a8"))
    d.ellipse((6, 15 + frame % 2, 26, 25 + frame % 2), outline=color, width=2)
    d.ellipse((10, 17 + frame % 2, 22, 23 + frame % 2), outline=PAL["white"], width=1)
    d.polygon([(16, 3), (24, 12), (16, 22), (8, 12)], fill=PAL["outline"])
    d.polygon([(16, 5), (22, 12), (16, 20), (10, 12)], fill=color)
    d.rectangle((14, 8, 18, 10), fill=PAL["white"])
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
    img = canvas(40, 36)
    d = ImageDraw.Draw(img)
    draw_shadow(d, 9, 31, 22)

    def small_humanoid(x: int, y: int, skin: tuple[int, int, int, int], armor: tuple[int, int, int, int], hood: tuple[int, int, int, int] | None = None) -> None:
        d.rectangle((x + 8, y + 14, x + 22, y + 28), fill=PAL["outline"])
        d.rectangle((x + 10, y + 15, x + 20, y + 27), fill=armor)
        d.rectangle((x + 10, y + 4, x + 20, y + 14), fill=PAL["outline"])
        d.rectangle((x + 11, y + 5, x + 19, y + 13), fill=skin)
        if hood:
            d.polygon([(x + 8, y + 8), (x + 15, y + 2), (x + 22, y + 8), (x + 20, y + 15), (x + 10, y + 15)], fill=PAL["outline"])
            d.polygon([(x + 10, y + 8), (x + 15, y + 4), (x + 20, y + 8), (x + 18, y + 13), (x + 12, y + 13)], fill=hood)
        d.rectangle((x + 12, y + 9, x + 14, y + 11), fill=PAL["ink"])
        d.rectangle((x + 17, y + 9, x + 19, y + 11), fill=PAL["ink"])
        d.rectangle((x + 9, y + 27, x + 13, y + 32), fill=PAL["outline"])
        d.rectangle((x + 17, y + 27, x + 21, y + 32), fill=PAL["outline"])
        d.rectangle((x + 10, y + 28, x + 12, y + 32), fill=rgba("#2b241e"))
        d.rectangle((x + 18, y + 28, x + 20, y + 32), fill=rgba("#2b241e"))

    if kind.startswith("goblin"):
        skin = rgba("#7fb75a") if kind != "goblin_dark" else rgba("#4f7f3d")
        armor = rgba("#31452f") if kind != "goblin_chief" else rgba("#6b4a2d")
        small_humanoid(4, 0, skin, armor)
        d.polygon([(14, 8), (6, 3), (12, 12)], fill=PAL["outline"])
        d.polygon([(26, 8), (34, 3), (28, 12)], fill=PAL["outline"])
        d.polygon([(14, 8), (8, 5), (13, 10)], fill=skin)
        d.polygon([(26, 8), (32, 5), (27, 10)], fill=skin)
        d.rectangle((8, 19, 15, 21), fill=PAL["outline"])
        d.rectangle((9, 20, 14, 20), fill=rgba("#c8d6df"))
        if kind == "goblin_chief":
            d.rectangle((17, 2, 22, 4), fill=PAL["red"])
            d.rectangle((19, 0, 20, 5), fill=PAL["gold_light"])
    elif kind.startswith("archer"):
        hood = rgba("#313a42") if kind != "archer_bone" else rgba("#d2c8b3")
        skin = PAL["skin"] if kind != "archer_bone" else rgba("#e4d8bf")
        armor = rgba("#3d4a3d") if kind != "archer_dark" else rgba("#382d2d")
        small_humanoid(4, 0, skin, armor, hood)
        d.arc((25, 7, 38, 28), 255, 100, fill=PAL["outline"], width=3)
        d.arc((26, 8, 37, 27), 255, 100, fill=PAL["bark"], width=1)
        d.line((32, 9, 32, 27), fill=PAL["gold_light"], width=1)
        d.rectangle((24, 18, 37, 19), fill=PAL["gold_light"])
        if kind == "archer_bone":
            d.rectangle((12, 10, 14, 12), fill=PAL["ink"])
            d.rectangle((18, 10, 20, 12), fill=PAL["ink"])
    elif kind.startswith("skeleton"):
        bone = rgba("#e7ddc8") if kind != "skeleton_dark" else rgba("#7f858c")
        d.rectangle((14, 4, 26, 15), fill=PAL["outline"])
        d.rectangle((15, 5, 25, 14), fill=bone)
        d.rectangle((17, 9, 19, 11), fill=PAL["ink"])
        d.rectangle((22, 9, 24, 11), fill=PAL["ink"])
        d.rectangle((16, 16, 24, 26), fill=bone)
        d.rectangle((14, 18, 15, 27), fill=bone)
        d.rectangle((25, 18, 26, 27), fill=bone)
        d.rectangle((12, 27, 17, 31), fill=bone)
        d.rectangle((23, 27, 28, 31), fill=bone)
        if kind == "skeleton_armored":
            d.rectangle((12, 14, 28, 23), fill=PAL["outline"])
            d.rectangle((14, 15, 26, 22), fill=rgba("#4c5e78"))
        if kind == "skeleton_mage":
            d.rectangle((29, 8, 31, 30), fill=PAL["bark"])
            d.rectangle((27, 5, 33, 10), fill=PAL["cyan"])
    elif kind.startswith("ice_bat") or kind == "skull_bat":
        wing = rgba("#55708d") if kind != "ice_bat_frost" else rgba("#8fb1d4")
        if kind == "skull_bat":
            wing = rgba("#4b355d")
        d.polygon([(1, 14), (11, 6), (17, 15), (20, 10), (23, 15), (29, 6), (39, 14), (30, 24), (22, 20), (18, 20), (10, 24)], fill=PAL["outline"])
        d.polygon([(4, 14), (11, 9), (17, 17), (20, 12), (23, 17), (29, 9), (36, 14), (29, 21), (22, 18), (18, 18), (11, 21)], fill=wing)
        if kind == "skull_bat":
            d.rectangle((15, 11, 25, 20), fill=rgba("#e4d8bf"))
            d.rectangle((17, 15, 19, 17), fill=PAL["ink"])
            d.rectangle((22, 15, 24, 17), fill=PAL["ink"])
        else:
            d.rectangle((16, 13, 24, 20), fill=PAL["cyan_dark"])
            d.rectangle((18, 14, 22, 18), fill=PAL["cyan_light"])
    elif kind in {"yeti", "ice_golem", "armored_brute"}:
        body = PAL["snow"] if kind == "yeti" else rgba("#8ea2b8") if kind == "ice_golem" else rgba("#4e5868")
        hi = PAL["snow_shadow"] if kind == "yeti" else PAL["cyan_light"] if kind == "ice_golem" else rgba("#aeb6c2")
        d.rectangle((7, 13, 33, 30), fill=PAL["outline"])
        d.rectangle((9, 11, 31, 29), fill=body)
        d.rectangle((13, 5, 27, 16), fill=PAL["outline"])
        d.rectangle((14, 6, 26, 15), fill=hi)
        d.rectangle((15, 12, 17, 14), fill=PAL["ink"])
        d.rectangle((23, 12, 25, 14), fill=PAL["ink"])
        d.rectangle((4, 17, 10, 27), fill=PAL["outline"])
        d.rectangle((30, 17, 36, 27), fill=PAL["outline"])
        if kind == "ice_golem":
            d.rectangle((18, 17, 23, 18), fill=PAL["cyan"])
    elif kind == "wind_spirit":
        d.ellipse((9, 4, 31, 25), fill=rgba("#d8f6ff", 155))
        d.ellipse((12, 7, 28, 23), outline=PAL["cyan_light"], width=2)
        d.rectangle((15, 13, 17, 15), fill=PAL["cyan_dark"])
        d.rectangle((23, 13, 25, 15), fill=PAL["cyan_dark"])
        d.line((3, 27, 20, 22, 37, 26), fill=PAL["cyan_light"], width=2)
    elif kind == "portal_blue":
        d.ellipse((7, 2, 33, 30), outline=PAL["cyan"], width=3)
        d.ellipse((12, 7, 28, 25), outline=PAL["cyan_light"], width=2)
        d.rectangle((18, 0, 21, 33), fill=rgba("#d8f6ff", 130))
        d.rectangle((4, 14, 36, 17), fill=rgba("#55b6ff", 130))
        for x, y in [(10, 5), (30, 10), (8, 25), (32, 24)]:
            d.rectangle((x, y, x + 2, y + 2), fill=PAL["cyan_light"])
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


def potion(color: tuple[int, int, int, int] = PAL["cyan"]) -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((6, 1, 10, 4), fill=PAL["stone_light"])
    d.rectangle((5, 4, 11, 13), fill=PAL["outline"])
    d.rectangle((6, 5, 10, 12), fill=color)
    d.rectangle((7, 5, 9, 7), fill=PAL["white"])
    return img


def exp_badge() -> Image.Image:
    img = canvas(24, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((1, 3, 22, 13), fill=PAL["outline"])
    d.rectangle((3, 4, 20, 12), fill=PAL["gold_dark"])
    d.rectangle((5, 6, 18, 9), fill=PAL["gold_light"])
    return img


def treasure_chest(kind: str = "gold") -> Image.Image:
    img = canvas(32, 24)
    d = ImageDraw.Draw(img)
    trim = PAL["gold"] if kind == "gold" else PAL["cyan"] if kind == "blue" else PAL["red"]
    trim_dark = PAL["gold_dark"] if kind == "gold" else PAL["cyan_dark"] if kind == "blue" else rgba("#7a2530")
    d.rectangle((3, 8, 29, 22), fill=PAL["outline"])
    d.rectangle((5, 10, 27, 20), fill=PAL["bark"])
    d.rectangle((6, 6, 26, 12), fill=trim_dark)
    d.rectangle((7, 7, 25, 10), fill=trim)
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
    d.rectangle((1, 1, 14, 14), fill=rgba("#252f37"))
    for x, y, w in [(2, 2, 7), (9, 5, 5), (3, 10, 8), (11, 12, 3)]:
        d.rectangle((x, y, x + w, y + 1), fill=PAL["stone_mid"])
    d.line((3, 7, 9, 9, 13, 6), fill=PAL["outline"], width=1)
    d.point((12, 3), fill=PAL["cyan_dark"])
    return img


def wood_tile() -> Image.Image:
    img = canvas(16, 16)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 3, 15, 12), fill=PAL["outline"])
    d.rectangle((1, 4, 14, 11), fill=PAL["bark_dark"])
    d.rectangle((2, 5, 12, 5), fill=PAL["bark"])
    d.rectangle((2, 9, 13, 9), fill=rgba("#5d3b23"))
    d.rectangle((7, 4, 8, 11), fill=PAL["outline"])
    d.point((4, 7), fill=PAL["orange"])
    return img


def write_manifest(manifest: dict[str, dict]) -> None:
    folders: dict[str, list[str]] = {}
    for rel in sorted(manifest):
        folder = str(Path(rel).parent)
        folders.setdefault(folder, []).append(rel)
    payload = {
        "generatedBy": "tools/generate-separated-assets.py",
        "rule": "Every gameplay asset is exported as an individual transparent PNG; no sprite atlases or tilemap sheets are generated.",
        "style": "2D pixel art, nearest-neighbor, transparent backgrounds for gameplay sprites.",
        "assetCount": len(manifest),
        "folders": folders,
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
