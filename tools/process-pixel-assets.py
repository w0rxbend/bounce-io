from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "assets" / "hero_sheet_source.png"
ENVIRONMENT_SOURCE = ROOT / "tools" / "assets" / "environment_sheet_source.png"
OUT = ROOT / "apps" / "client" / "public" / "assets" / "pixel"

HERO_COLUMNS = 8
HERO_ROWS = 7
HERO_SOURCE_FRAME = 64
HERO_FRAME = 80
HERO_ANCHOR_X = HERO_FRAME // 2
HERO_BASELINE_Y = 72
HERO_SAFE_SIZE = 60
HERO_SHEET_NAME = "hero_sheet_640x560"
TILE = 16
KEY_COLOR = (255, 0, 255)
STONE = (76, 94, 120)
STONE_DARK = (38, 53, 74)
STONE_DEEP = (25, 34, 48)
STONE_LIGHT = (102, 121, 148)
SNOW = (233, 242, 255)
SNOW_SHADE = (166, 196, 224)
GRASS = (125, 154, 91)
GRASS_DARK = (109, 140, 71)
PINE = (54, 90, 63)
MAGIC_BLUE = (85, 182, 255)
GOLD = (226, 184, 79)
RELIC_RED = (200, 74, 74)

HERO_ANIMATIONS = {
    "idle": {"row": 0, "frames": list(range(8)), "durationMs": 180},
    "walk": {"row": 1, "frames": list(range(8)), "durationMs": 115},
    "run": {"row": 2, "frames": list(range(8)), "durationMs": 82},
    "jump_fall": {"row": 3, "frames": list(range(8)), "durationMs": 120},
    "kick_push": {"row": 4, "frames": list(range(8)), "durationMs": 95},
    "shoot_fire": {"row": 5, "frames": list(range(8)), "durationMs": 85},
    "hit_death_special": {"row": 6, "frames": list(range(8)), "durationMs": 130},
}

PLAYER_FRAME_EXPORTS = {
    "player_explorer_24x32": (0, 0),
    "player_idle_24x32": (0, 1),
    "player_run_1_24x32": (2, 1),
    "player_run_2_24x32": (2, 4),
    "player_jump_24x32": (3, 1),
    "player_fall_24x32": (3, 5),
    "player_kick_24x32": (4, 2),
}

ENVIRONMENT_EXPORTS = {
    "floating_island_96": {"rect": (0, 0, 120, 62), "size": (96, 48), "tags": ["environment", "platform", "floating-island"]},
    "moss_platform_32": {"rect": (447, 0, 482, 24), "size": (32, 16), "tags": ["environment", "platform"]},
    "moss_platform_cracked_32": {"rect": (484, 0, 520, 24), "size": (32, 16), "tags": ["environment", "platform"]},
    "moss_platform_overhang_32": {"rect": (578, 0, 616, 25), "size": (32, 16), "tags": ["environment", "platform"]},
    "moss_platform_flowers_32": {"rect": (0, 255, 130, 305), "size": (32, 16), "tags": ["environment", "platform"]},
    "moss_platform_roots_32": {"rect": (0, 0, 76, 26), "size": (32, 16), "tags": ["environment", "platform"]},
    "moss_platform_runes_32": {"rect": (386, 65, 438, 96), "size": (32, 16), "tags": ["environment", "platform", "runes"]},
    "stone_ledge_48": {"rect": (126, 182, 206, 214), "size": (48, 18), "tags": ["environment", "platform", "stone"]},
    "grass_clump_16": {"rect": (500, 292, 540, 327), "size": (16, 16), "tags": ["environment", "vegetation"]},
    "flower_patch_16": {"rect": (468, 286, 510, 326), "size": (16, 16), "tags": ["environment", "vegetation", "flowers"]},
    "leaf_cluster_16": {"rect": (558, 292, 608, 328), "size": (16, 16), "tags": ["environment", "vegetation"]},
    "bush_32": {"rect": (545, 286, 625, 332), "size": (32, 24), "tags": ["environment", "vegetation"]},
    "tree_48": {"rect": (904, 183, 1002, 306), "size": (48, 64), "tags": ["environment", "tree"]},
    "stump_24x24": {"rect": (678, 320, 724, 365), "size": (24, 24), "tags": ["environment", "vegetation"]},
    "mushroom_cluster_24": {"rect": (192, 652, 241, 699), "size": (24, 24), "tags": ["environment", "vegetation"]},
    "vine_hanging_16": {"rect": (26, 645, 70, 745), "size": (16, 24), "tags": ["environment", "vegetation", "hanging"]},
    "pebble_cluster_16": {"rect": (406, 424, 478, 451), "size": (16, 16), "tags": ["environment", "stone"]},
    "hazard_spikes_16": {"rect": (0, 377, 68, 447), "size": (16, 16), "tags": ["environment", "hazard"]},
    "rune_stone_16": {"rect": (381, 184, 424, 288), "size": (16, 24), "tags": ["environment", "rune"]},
    "signpost_16x24": {"rect": (958, 304, 1016, 356), "size": (16, 24), "tags": ["environment", "prop"]},
    "fence_32x16": {"rect": (890, 315, 958, 362), "size": (32, 16), "tags": ["environment", "prop"]},
    "rope_bridge_48x16": {"rect": (417, 381, 552, 436), "size": (48, 16), "tags": ["environment", "traversal"]},
    "lantern_cyan_16x24": {"rect": (876, 382, 906, 445), "size": (16, 24), "tags": ["environment", "prop", "light"]},
    "ruin_arch_fragment_32": {"rect": (0, 637, 112, 746), "size": (32, 32), "tags": ["environment", "ruins"]},
    "ruin_column_24x40": {"rect": (395, 548, 430, 633), "size": (24, 40), "tags": ["environment", "ruins"]},
    "crystal_marker_16x24": {"rect": (286, 383, 338, 448), "size": (16, 24), "tags": ["environment", "crystal"]},
    "portal_arch_64": {"rect": (760, 542, 854, 635), "size": (64, 64), "tags": ["environment", "portal", "ruins"]},
    "cloud_96": {"rect": (0, 835, 160, 885), "size": (96, 40), "tags": ["environment", "cloud"]},
    "cloud_small_64": {"rect": (232, 875, 312, 908), "size": (64, 28), "tags": ["environment", "cloud"]},
    "cloud_tall_80": {"rect": (0, 898, 142, 968), "size": (80, 56), "tags": ["environment", "cloud"]},
    "cloud_long_144": {"rect": (0, 899, 214, 968), "size": (144, 48), "tags": ["environment", "cloud"]},
    "cloud_wispy_128": {"rect": (448, 846, 650, 886), "size": (128, 32), "tags": ["environment", "cloud"]},
    "cloud_cluster_160": {"rect": (0, 833, 220, 902), "size": (160, 64), "tags": ["environment", "cloud"]},
    "cloud_flat_192": {"rect": (0, 900, 244, 970), "size": (192, 36), "tags": ["environment", "cloud"]},
    "cloud_streak_224": {"rect": (385, 835, 662, 884), "size": (224, 32), "tags": ["environment", "cloud"]},
    "cloud_puff_112": {"rect": (214, 898, 382, 958), "size": (112, 56), "tags": ["environment", "cloud"]},
    "coin_16": {"rect": (831, 931, 879, 986), "size": (16, 16), "tags": ["collectible"]},
    "coin_spin_0_16": {"rect": (831, 931, 879, 986), "size": (16, 16), "tags": ["collectible"]},
    "coin_spin_1_16": {"rect": (831, 931, 879, 986), "size": (16, 16), "tags": ["collectible"]},
    "coin_spin_2_16": {"rect": (831, 931, 879, 986), "size": (16, 16), "tags": ["collectible"]},
    "coin_spin_3_16": {"rect": (831, 931, 879, 986), "size": (16, 16), "tags": ["collectible"]},
    "crown_16": {"rect": (898, 932, 940, 986), "size": (16, 16), "tags": ["collectible", "relic"]},
    "gem_cyan_0_16": {"rect": (0, 506, 38, 548), "size": (16, 16), "tags": ["collectible", "gem"]},
    "gem_cyan_1_16": {"rect": (39, 507, 70, 548), "size": (16, 16), "tags": ["collectible", "gem"]},
    "gem_cyan_2_16": {"rect": (252, 506, 286, 550), "size": (16, 16), "tags": ["collectible", "gem"]},
    "gem_cyan_3_16": {"rect": (576, 506, 610, 550), "size": (16, 16), "tags": ["collectible", "gem"]},
    "relic_pink_0_16": {"rect": (945, 922, 1016, 998), "size": (16, 16), "tags": ["collectible", "relic"]},
    "relic_pink_1_16": {"rect": (945, 922, 1016, 998), "size": (16, 16), "tags": ["collectible", "relic"]},
    "relic_pink_2_16": {"rect": (945, 922, 1016, 998), "size": (16, 16), "tags": ["collectible", "relic"]},
    "relic_pink_3_16": {"rect": (945, 922, 1016, 998), "size": (16, 16), "tags": ["collectible", "relic"]},
    "seed_green_0_16": {"rect": (72, 506, 103, 548), "size": (16, 16), "tags": ["collectible", "gem"]},
    "seed_green_1_16": {"rect": (72, 506, 103, 548), "size": (16, 16), "tags": ["collectible", "gem"]},
    "seed_green_2_16": {"rect": (72, 506, 103, 548), "size": (16, 16), "tags": ["collectible", "gem"]},
    "seed_green_3_16": {"rect": (72, 506, 103, 548), "size": (16, 16), "tags": ["collectible", "gem"]},
    "star_shard_0_16": {"rect": (574, 895, 651, 964), "size": (16, 16), "tags": ["collectible", "sparkle"]},
    "star_shard_1_16": {"rect": (640, 894, 707, 964), "size": (16, 16), "tags": ["collectible", "sparkle"]},
    "star_shard_2_16": {"rect": (712, 890, 778, 964), "size": (16, 16), "tags": ["collectible", "sparkle"]},
    "star_shard_3_16": {"rect": (778, 784, 812, 900), "size": (16, 16), "tags": ["collectible", "sparkle"]},
    "collectible_ring_24": {"rect": (382, 890, 550, 966), "size": (24, 24), "tags": ["effect", "magic"]},
    "collectible_sparkle_16": {"rect": (574, 895, 651, 964), "size": (16, 16), "tags": ["effect", "sparkle"]},
    "height_arrow_16": {"rect": (778, 784, 812, 900), "size": (16, 16), "tags": ["ui", "height"]},
}


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def body_center_x(image: Image.Image, row: int) -> float:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return image.width / 2
    left, top, right, bottom = bbox
    pixels = alpha.load()
    xs: list[int] = []
    if row < 6:
        body_top = top + int((bottom - top) * 0.42)
        for y in range(body_top, bottom):
            for x in range(left, right):
                if pixels[x, y] > 0:
                    xs.append(x)
    if not xs:
        for y in range(top, bottom):
            for x in range(left, right):
                if pixels[x, y] > 0:
                    xs.append(x)
    return (min(xs) + max(xs)) / 2 if xs else image.width / 2


def normalize_hero_cell(cell: Image.Image, row: int) -> Image.Image:
    bbox = alpha_bbox(cell)
    if not bbox:
        return cell

    sprite = cell.crop(bbox)
    max_w = HERO_SAFE_SIZE
    max_h = HERO_SAFE_SIZE
    scale = min(1.0, max_w / sprite.width, max_h / sprite.height)
    if scale < 1.0:
        sprite = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.Resampling.NEAREST,
        )

    center = body_center_x(sprite, row)
    x = round(HERO_ANCHOR_X - center)
    y = HERO_BASELINE_Y - sprite.height + 1
    x = max(0, min(HERO_FRAME - sprite.width, x))
    y = max(0, min(HERO_FRAME - sprite.height, y))

    normalized = Image.new("RGBA", (HERO_FRAME, HERO_FRAME), (0, 0, 0, 0))
    normalized.alpha_composite(sprite, (x, y))
    return normalized


def fit_sprite_to_canvas(sprite: Image.Image, size: tuple[int, int]) -> tuple[Image.Image, tuple[int, int, int, int]]:
    bbox = alpha_bbox(sprite)
    if bbox:
        sprite = sprite.crop(bbox)
    target_w, target_h = size
    scale = min(target_w / sprite.width, target_h / sprite.height)
    fitted = sprite.resize(
        (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (target_w - fitted.width) // 2
    y = target_h - fitted.height
    canvas.alpha_composite(fitted, (x, y))
    bounds = alpha_bbox(canvas) or (0, 0, 0, 0)
    return canvas, bounds


def transparentize_checkerboard(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            is_exact_key = abs(r - KEY_COLOR[0]) <= 18 and g <= 28 and abs(b - KEY_COLOR[2]) <= 18
            is_key_edge = r >= 80 and b >= 100 and g <= 190 and (r + b - 2 * g) >= 80
            is_neutral = max(r, g, b) - min(r, g, b) <= 10
            is_light = r >= 218 and g >= 218 and b >= 218
            if is_exact_key or is_key_edge or (is_neutral and is_light):
                pixels[x, y] = (255, 255, 255, 0)
    return rgba


def build_hero_sheet() -> dict:
    source = transparentize_checkerboard(Image.open(SOURCE))
    source_cell_w = source.width / HERO_COLUMNS
    source_cell_h = source.height / HERO_ROWS
    sheet = Image.new("RGBA", (HERO_COLUMNS * HERO_FRAME, HERO_ROWS * HERO_FRAME), (0, 0, 0, 0))

    for row in range(HERO_ROWS):
        for col in range(HERO_COLUMNS):
            left = round(col * source_cell_w)
            top = round(row * source_cell_h)
            right = round((col + 1) * source_cell_w)
            bottom = round((row + 1) * source_cell_h)
            cell = source.crop((left, top, right, bottom)).resize((HERO_SOURCE_FRAME, HERO_SOURCE_FRAME), Image.Resampling.NEAREST)
            cell = normalize_hero_cell(cell, row)
            sheet.alpha_composite(cell, (col * HERO_FRAME, row * HERO_FRAME))

    sheet_path = OUT / f"{HERO_SHEET_NAME}.png"
    sheet.save(sheet_path)

    for name, (row, col) in PLAYER_FRAME_EXPORTS.items():
        frame = sheet.crop((
            col * HERO_FRAME,
            row * HERO_FRAME,
            (col + 1) * HERO_FRAME,
            (row + 1) * HERO_FRAME,
        ))
        frame.thumbnail((24, 32), Image.Resampling.NEAREST)
        export = Image.new("RGBA", (24, 32), (0, 0, 0, 0))
        export.alpha_composite(frame, ((24 - frame.width) // 2, 32 - frame.height))
        export.save(OUT / f"{name}.png")

    frames = {}
    for row in range(HERO_ROWS):
        for col in range(HERO_COLUMNS):
            frame_name = f"hero_r{row}_c{col}"
            cell = sheet.crop((
                col * HERO_FRAME,
                row * HERO_FRAME,
                (col + 1) * HERO_FRAME,
                (row + 1) * HERO_FRAME,
            ))
            bounds = alpha_bbox(cell) or (0, 0, 0, 0)
            frames[frame_name] = {
                "frame": {"x": col * HERO_FRAME, "y": row * HERO_FRAME, "w": HERO_FRAME, "h": HERO_FRAME},
                "sourceSize": {"w": HERO_FRAME, "h": HERO_FRAME},
                "spriteSourceSize": {"x": 0, "y": 0, "w": HERO_FRAME, "h": HERO_FRAME},
                "contentBounds": {"x": bounds[0], "y": bounds[1], "w": bounds[2] - bounds[0], "h": bounds[3] - bounds[1]},
                "pivot": {"x": HERO_ANCHOR_X, "y": HERO_BASELINE_Y},
                "tags": ["player", "hero"],
                "durationMs": 120,
            }

    metadata = {
        "image": f"/assets/pixel/{HERO_SHEET_NAME}.png",
        "frameWidth": HERO_FRAME,
        "frameHeight": HERO_FRAME,
        "columns": HERO_COLUMNS,
        "rows": HERO_ROWS,
        "anchor": {"x": HERO_ANCHOR_X / HERO_FRAME, "y": HERO_BASELINE_Y / HERO_FRAME},
        "anchorPixel": {"x": HERO_ANCHOR_X, "y": HERO_BASELINE_Y},
        "animations": HERO_ANIMATIONS,
        "frames": frames,
    }
    (OUT / "hero_sheet.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata


def draw_grass_tile(draw: ImageDraw.ImageDraw, x: int, y: int, variant: int) -> None:
    stone = [STONE, (67, 84, 108), (86, 103, 128)][variant % 3]
    draw.rectangle((x, y + 3, x + 15, y + 15), fill=STONE_DEEP)
    for by in range(4, 16, 4):
        draw.rectangle((x + 1, y + by, x + 14, y + min(15, by + 3)), fill=stone)
        draw.line((x + 1, y + by, x + 14, y + by), fill=STONE_LIGHT)
    for bx in (5 + variant, 11 - variant):
        draw.line((x + bx, y + 5, x + bx, y + 14), fill=STONE_DARK)
    draw.rectangle((x, y, x + 15, y + 2), fill=SNOW)
    draw.rectangle((x + 2, y + 2, x + 11, y + 3), fill=SNOW_SHADE)
    if variant % 2 == 0:
        draw.rectangle((x + 2, y + 3, x + 13, y + 4), fill=GRASS_DARK)
        draw.rectangle((x + 4, y + 3, x + 10, y + 3), fill=GRASS)
    for i in range(3):
        tx = x + 1 + i * 3 + ((variant + i) % 2)
        draw.line((tx, y + 2, tx, y + 1), fill=SNOW)


def draw_spikes(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.rectangle((x, y + 13, x + 15, y + 15), fill=STONE_DEEP)
    for sx, h in ((1, 10), (6, 7), (11, 11)):
        draw.polygon([(x + sx, y + 13), (x + sx + 2, y + h), (x + sx + 4, y + 13)], fill=STONE_DARK)
        draw.line((x + sx + 2, y + h + 1, x + sx + 2, y + 11), fill=STONE_LIGHT)
    draw.rectangle((x + 1, y + 12, x + 14, y + 13), fill=SNOW_SHADE)


def draw_ladder(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    wood = (118, 79, 49)
    dark = (55, 38, 28)
    draw.rectangle((x + 3, y, x + 4, y + 15), fill=dark)
    draw.rectangle((x + 11, y, x + 12, y + 15), fill=dark)
    for yy in range(2, 15, 4):
        draw.rectangle((x + 3, y + yy, x + 12, y + yy + 1), fill=wood)
        draw.point((x + 5, y + yy), fill=SNOW)
        draw.point((x + 10, y + yy), fill=SNOW)


def draw_cloud(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    shade = (148, 174, 202, 210)
    mid = (198, 218, 234, 230)
    hi = (244, 249, 255, 235)
    draw.rectangle((x + 2, y + 8, x + 14, y + 12), fill=shade)
    draw.rectangle((x + 1, y + 7, x + 15, y + 11), fill=mid)
    draw.rectangle((x + 4, y + 5, x + 9, y + 8), fill=hi)
    draw.rectangle((x + 9, y + 6, x + 13, y + 9), fill=hi)


def draw_crystal(draw: ImageDraw.ImageDraw, x: int, y: int, color: tuple[int, int, int]) -> None:
    dark = tuple(max(0, int(c * 0.35)) for c in color)
    light = tuple(min(255, int(c * 1.45)) for c in color)
    draw.polygon([(x + 8, y + 1), (x + 13, y + 6), (x + 10, y + 14), (x + 5, y + 14), (x + 2, y + 6)], fill=dark)
    draw.polygon([(x + 8, y + 2), (x + 12, y + 6), (x + 9, y + 13), (x + 6, y + 13), (x + 3, y + 6)], fill=color)
    draw.polygon([(x + 8, y + 3), (x + 10, y + 6), (x + 8, y + 9), (x + 6, y + 6)], fill=light)


def build_tileset() -> None:
    columns, rows = 10, 8
    sheet = Image.new("RGBA", (columns * TILE, rows * TILE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sheet)
    tile_names = [
        "empty", "snow_stone_a", "snow_stone_b", "snow_stone_c", "stone_wall_a", "stone_wall_b", "snow_cap", "cracked_snow", "collapse_snow", "ice_edge",
        "spike_rock", "icicle", "ladder_frost", "rope_bridge", "chain_ice", "wood_plank", "cloud_solid", "mist", "wind_ribbon", "waterfall",
        "muted_grass", "rare_flowers", "alpine_bush", "vine_root", "pebbles", "boulder_cluster", "standing_stone", "rune_stone", "blue_crystal", "green_crystal",
        "red_crystal", "gold_coin", "sky_crown", "relic_red", "jump_pad", "rune_ring", "portal_core", "beacon_core", "shrine_altar", "stone_gate",
        "arch_left", "arch_top", "arch_right", "rune_pillar", "statue", "broken_column", "relic_fragment", "weapon_stone", "skeleton", "backpack",
        "pine_top", "pine_mid", "pine_bottom", "wind_pine_top", "wind_pine_mid", "wind_pine_trunk", "snow_tree", "dead_tree", "stump", "moss_rock",
        "signpost", "banner_red", "banner_blue", "lantern", "campfire_0", "campfire_1", "crate", "barrel", "chest", "small_key",
        "floating_island_small", "floating_island_mid", "floating_island_tall", "hanging_ledge", "pillar_top", "pillar_mid", "pillar_bottom", "snow_particles", "magic_spark", "height_arrow",
    ]
    for idx, name in enumerate(tile_names):
        x = (idx % columns) * TILE
        y = (idx // columns) * TILE
        if name.startswith("snow_stone"):
            draw_grass_tile(draw, x, y, idx)
        elif name.startswith("stone_wall"):
            draw.rectangle((x, y, x + 15, y + 15), fill=(38, 39, 43))
            draw.rectangle((x + 1, y + 1, x + 14, y + 14), fill=STONE)
            draw.line((x + 2, y + 7, x + 13, y + 7), fill=STONE_DARK)
            draw.line((x + 7, y + 1, x + 7, y + 7), fill=STONE_DARK)
            draw.point((x + 3, y + 3), fill=SNOW_SHADE)
        elif name in {"snow_cap", "cracked_snow", "collapse_snow", "ice_edge"}:
            draw.rectangle((x, y + 4, x + 15, y + 15), fill=STONE_DARK)
            draw.rectangle((x, y, x + 15, y + 4), fill=SNOW)
            draw.rectangle((x + 2, y + 4, x + 10, y + 5), fill=SNOW_SHADE)
            if "cracked" in name or "collapse" in name:
                draw.line((x + 3, y + 1, x + 7, y + 3, x + 11, y + 2), fill=STONE_DARK)
        elif name == "spike_rock":
            draw_spikes(draw, x, y)
        elif name == "icicle":
            for sx in (2, 7, 12):
                draw.polygon([(x + sx, y), (x + sx + 3, y), (x + sx + 1, y + 12)], fill=SNOW_SHADE)
                draw.line((x + sx + 1, y + 1, x + sx + 1, y + 8), fill=SNOW)
        elif name == "ladder_frost":
            draw_ladder(draw, x, y)
        elif name == "chain_ice":
            for yy in range(0, 16, 4):
                draw.rectangle((x + 6, y + yy, x + 9, y + yy + 2), outline=STONE_LIGHT)
            draw.rectangle((x + 7, y + 13, x + 8, y + 15), fill=MAGIC_BLUE)
        elif name == "cloud_solid":
            draw_cloud(draw, x, y)
        elif name in {"blue_crystal", "beacon_core"}:
            draw_crystal(draw, x, y, MAGIC_BLUE)
        elif name == "red_crystal":
            draw_crystal(draw, x, y, RELIC_RED)
        elif name == "green_crystal":
            draw_crystal(draw, x, y, (92, 186, 98))
        elif name == "gold_coin":
            draw.ellipse((x + 4, y + 2, x + 12, y + 14), fill=(126, 84, 32))
            draw.ellipse((x + 5, y + 2, x + 11, y + 13), fill=GOLD)
            draw.rectangle((x + 6, y + 4, x + 9, y + 5), fill=(255, 232, 112))
        elif name in {"muted_grass", "rare_flowers", "alpine_bush", "moss_rock"}:
            draw.rectangle((x + 2, y + 11, x + 13, y + 14), fill=GRASS_DARK)
            draw.rectangle((x + 3, y + 8, x + 12, y + 12), fill=PINE)
            draw.rectangle((x + 5, y + 6, x + 10, y + 9), fill=GRASS)
            if name == "rare_flowers":
                draw.point((x + 5, y + 6), fill=(255, 170, 187))
                draw.point((x + 10, y + 7), fill=GOLD)
                draw.point((x + 7, y + 5), fill=(170, 132, 225))
        elif name in {"jump_pad", "rune_ring"}:
            draw.rectangle((x + 2, y + 10, x + 13, y + 14), fill=STONE_DARK)
            draw.rectangle((x + 4, y + 8, x + 11, y + 11), fill=STONE)
            draw.ellipse((x + 3, y + 2, x + 12, y + 10), outline=MAGIC_BLUE)
            draw.rectangle((x + 7, y + 4, x + 8, y + 9), fill=MAGIC_BLUE)
        elif name == "portal_core":
            draw.rectangle((x + 5, y + 1, x + 10, y + 15), fill=STONE_DARK)
            draw.rectangle((x + 7, y + 2, x + 8, y + 14), fill=MAGIC_BLUE)
        elif name.startswith("pine") or name.startswith("wind_pine") or name == "snow_tree":
            lean = -2 if name.startswith("wind") else 0
            draw.rectangle((x + 7 + lean, y + 10, x + 8 + lean, y + 15), fill=(80, 54, 36))
            draw.polygon([(x + 8 + lean, y + 1), (x + 2 + lean, y + 10), (x + 14 + lean, y + 10)], fill=PINE)
            draw.polygon([(x + 8 + lean, y + 5), (x + 3 + lean, y + 13), (x + 13 + lean, y + 13)], fill=(42, 72, 54))
            if name == "snow_tree":
                draw.line((x + 4 + lean, y + 8, x + 12 + lean, y + 8), fill=SNOW)
                draw.line((x + 5 + lean, y + 12, x + 11 + lean, y + 12), fill=SNOW)
        elif name in {"sky_crown", "relic_red"}:
            col = GOLD if name == "sky_crown" else RELIC_RED
            draw.polygon([(x + 2, y + 12), (x + 4, y + 5), (x + 7, y + 10), (x + 10, y + 4), (x + 13, y + 12)], fill=col)
            draw.rectangle((x + 3, y + 12, x + 13, y + 14), fill=(126, 84, 32))
        else:
            base = (62 + (idx * 13) % 60, 76 + (idx * 7) % 55, 88 + (idx * 5) % 65)
            draw.rectangle((x + 3, y + 4, x + 12, y + 13), fill=STONE_DEEP)
            draw.rectangle((x + 4, y + 3, x + 12, y + 12), fill=base)
            draw.rectangle((x + 5, y + 4, x + 10, y + 5), fill=tuple(min(255, c + 60) for c in base))
            draw.point((x + 5, y + 3), fill=SNOW)

    sheet.save(OUT / "tileset_terrain_16.png")
    tiles = {
        name: {"id": idx, "x": idx % columns, "y": idx // columns, "w": TILE, "h": TILE}
        for idx, name in enumerate(tile_names)
    }
    metadata = {
        "image": "/assets/pixel/tileset_terrain_16.png",
        "tileWidth": TILE,
        "tileHeight": TILE,
        "columns": columns,
        "rows": rows,
        "tiles": tiles,
    }
    (OUT / "tileset_terrain_16.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    build_tilemap_preview(sheet, metadata)


def build_tilemap_preview(tileset: Image.Image, metadata: dict) -> None:
    width, height = 24, 80
    ids = [[0 for _ in range(width)] for _ in range(height)]
    t = metadata["tiles"]

    def platform(y: int, x0: int, x1: int, tile: str = "snow_stone_a") -> None:
        for x in range(max(0, x0), min(width, x1)):
            ids[y][x] = t[tile]["id"]
            if y + 1 < height and (x + y) % 3 == 0:
                ids[y + 1][x] = t["hanging_ledge"]["id"]

    for row, spans in {
        76: [(1, 10), (13, 23)],
        68: [(2, 8), (12, 18)],
        60: [(7, 15), (18, 23)],
        52: [(1, 7), (11, 20)],
        44: [(4, 13), (16, 23)],
        36: [(2, 9), (13, 19)],
        28: [(7, 16), (18, 23)],
        20: [(2, 10), (14, 21)],
        12: [(8, 17)],
        5: [(10, 14)],
    }.items():
        for span in spans:
            platform(row, *span)
    for y in range(58, 76):
        ids[y][5] = t["ladder_frost"]["id"]
    for y in range(21, 36):
        ids[y][18] = t["chain_ice"]["id"]
    for x, y, name in [(4, 67, "spike_rock"), (12, 59, "blue_crystal"), (19, 51, "gold_coin"), (11, 11, "portal_core"), (21, 75, "chest")]:
        ids[y][x] = t[name]["id"]
    for x, y in [(3, 51), (14, 43), (20, 27), (5, 19), (15, 67)]:
        ids[y][x] = t["cloud_solid"]["id"]

    preview = Image.new("RGBA", (width * TILE, height * TILE), (0, 0, 0, 0))
    for y, row in enumerate(ids):
        for x, tile_id in enumerate(row):
            if tile_id == 0:
                continue
            sx = (tile_id % metadata["columns"]) * TILE
            sy = (tile_id // metadata["columns"]) * TILE
            preview.alpha_composite(tileset.crop((sx, sy, sx + TILE, sy + TILE)), (x * TILE, y * TILE))
    preview.save(OUT / "tilemap_vertical_showcase.png")
    data = {
        "tileset": "/assets/pixel/tileset_terrain_16.json",
        "tileWidth": TILE,
        "tileHeight": TILE,
        "width": width,
        "height": height,
        "layers": [{"name": "terrain", "data": [tile for row in ids for tile in row]}],
    }
    (OUT / "tilemap_vertical_showcase.json").write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def build_mountain_derivatives() -> None:
    mountain = Image.open(OUT / "bg_mountain_panorama_887x1774.png").convert("RGBA")
    crops = {
        "bg_mountain_wide_1024x192": (0.0, 0.10, 1.0, 0.42),
        "bg_mountain_wide2_1024x192": (0.0, 0.38, 1.0, 0.70),
        "bg_mountain_tall_192x384": (0.31, 0.12, 0.69, 0.78),
    }
    for name, (left, top, right, bottom) in crops.items():
        box = (
            round(mountain.width * left),
            round(mountain.height * top),
            round(mountain.width * right),
            round(mountain.height * bottom),
        )
        size = (192, 384) if name.endswith("192x384") else (1024, 192)
        mountain.crop(box).resize(size, Image.Resampling.LANCZOS).save(OUT / f"{name}.png")


def build_environment_reference_sheet() -> dict:
    if not ENVIRONMENT_SOURCE.exists():
        return {}
    sheet = transparentize_checkerboard(Image.open(ENVIRONMENT_SOURCE))
    sheet = sheet.resize((1024, 1024), Image.Resampling.NEAREST)
    sheet.save(OUT / "environment_sheet_1024.png")
    frames = {}
    for name, spec in ENVIRONMENT_EXPORTS.items():
        rect = spec["rect"]
        size = spec["size"]
        sprite, bounds = fit_sprite_to_canvas(sheet.crop(rect), size)
        sprite.save(OUT / f"{name}.png")
        svg_path = OUT / f"{name}.svg"
        if svg_path.exists():
            svg_path.unlink()
        frames[name] = {
            "frame": {"x": rect[0], "y": rect[1], "w": rect[2] - rect[0], "h": rect[3] - rect[1]},
            "sourceSize": {"w": size[0], "h": size[1]},
            "spriteSourceSize": {"x": bounds[0], "y": bounds[1], "w": bounds[2] - bounds[0], "h": bounds[3] - bounds[1]},
            "pivot": {"x": size[0] / 2, "y": size[1]},
            "tags": spec.get("tags", ["environment"]),
            "durationMs": 120,
        }
    metadata = {
        "image": "/assets/pixel/environment_sheet_1024.png",
        "width": 1024,
        "height": 1024,
        "exports": {
            name: {**frame, "image": f"/assets/pixel/{name}.png"}
            for name, frame in frames.items()
        },
        "sourceFrames": frames,
    }
    (OUT / "environment_sheet.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata


def update_manifest_and_atlas(hero_metadata: dict, environment_metadata: dict) -> None:
    manifest_path = OUT / "manifest.json"
    atlas_path = OUT / "sprite_atlas.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))

    extra_assets = {
        "bg_mountain_panorama_887x1774": {"png": "/assets/pixel/bg_mountain_panorama_887x1774.png", "width": 887, "height": 1774},
        "bg_mountain_wide_1024x192": {"png": "/assets/pixel/bg_mountain_wide_1024x192.png", "width": 1024, "height": 192},
        "bg_mountain_wide2_1024x192": {"png": "/assets/pixel/bg_mountain_wide2_1024x192.png", "width": 1024, "height": 192},
        "bg_mountain_tall_192x384": {"png": "/assets/pixel/bg_mountain_tall_192x384.png", "width": 192, "height": 384},
        HERO_SHEET_NAME: {"png": f"/assets/pixel/{HERO_SHEET_NAME}.png", "json": "/assets/pixel/hero_sheet.json", "width": HERO_COLUMNS * HERO_FRAME, "height": HERO_ROWS * HERO_FRAME},
        "environment_sheet_1024": {"png": "/assets/pixel/environment_sheet_1024.png", "json": "/assets/pixel/environment_sheet.json", "width": 1024, "height": 1024},
        "tileset_terrain_16": {"png": "/assets/pixel/tileset_terrain_16.png", "json": "/assets/pixel/tileset_terrain_16.json", "width": 160, "height": 128},
        "tilemap_vertical_showcase": {"png": "/assets/pixel/tilemap_vertical_showcase.png", "json": "/assets/pixel/tilemap_vertical_showcase.json", "width": 384, "height": 1280},
    }
    manifest.update(extra_assets)

    atlas["frames"][HERO_SHEET_NAME] = {
        "frame": {"x": 0, "y": 0, "w": HERO_COLUMNS * HERO_FRAME, "h": HERO_ROWS * HERO_FRAME},
        "sourceSize": {"w": HERO_COLUMNS * HERO_FRAME, "h": HERO_ROWS * HERO_FRAME},
        "spriteSourceSize": {"x": 0, "y": 0, "w": HERO_COLUMNS * HERO_FRAME, "h": HERO_ROWS * HERO_FRAME},
        "pivot": {"x": 0, "y": 0},
        "tags": ["player", "spritesheet"],
        "durationMs": 120,
        "image": f"/assets/pixel/{HERO_SHEET_NAME}.png",
    }
    for name, frame in hero_metadata["frames"].items():
        atlas["frames"][name] = {**frame, "image": f"/assets/pixel/{HERO_SHEET_NAME}.png"}
    atlas["animations"] = {
        **atlas.get("animations", {}),
        "hero": hero_metadata["animations"],
    }
    atlas["frames"]["tileset_terrain_16"] = {
        "frame": {"x": 0, "y": 0, "w": 160, "h": 128},
        "sourceSize": {"w": 160, "h": 128},
        "spriteSourceSize": {"x": 0, "y": 0, "w": 160, "h": 128},
        "pivot": {"x": 0, "y": 0},
        "tags": ["tileset", "terrain"],
        "durationMs": 120,
        "image": "/assets/pixel/tileset_terrain_16.png",
    }
    atlas["frames"]["environment_sheet_1024"] = {
        "frame": {"x": 0, "y": 0, "w": 1024, "h": 1024},
        "sourceSize": {"w": 1024, "h": 1024},
        "spriteSourceSize": {"x": 0, "y": 0, "w": 1024, "h": 1024},
        "pivot": {"x": 0, "y": 0},
        "tags": ["environment", "reference-sheet"],
        "durationMs": 120,
        "image": "/assets/pixel/environment_sheet_1024.png",
    }
    for name, frame in environment_metadata.get("exports", {}).items():
        manifest[name] = {
            "png": frame["image"],
            "sourceSheet": "/assets/pixel/environment_sheet_1024.png",
            "sourceFrame": environment_metadata["sourceFrames"][name]["frame"],
            "width": frame["sourceSize"]["w"],
            "height": frame["sourceSize"]["h"],
        }
        atlas["frames"][name] = {
            "frame": {"x": 0, "y": 0, "w": frame["sourceSize"]["w"], "h": frame["sourceSize"]["h"]},
            "sourceSize": frame["sourceSize"],
            "spriteSourceSize": frame["spriteSourceSize"],
            "pivot": frame["pivot"],
            "tags": frame["tags"],
            "durationMs": frame["durationMs"],
            "image": frame["image"],
        }

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    atlas_path.write_text(json.dumps(atlas, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    hero_metadata = build_hero_sheet()
    build_tileset()
    build_mountain_derivatives()
    environment_metadata = build_environment_reference_sheet()
    update_manifest_and_atlas(hero_metadata, environment_metadata)
    print("Processed AI hero sheet, environment exports, 16px terrain tileset, and vertical tilemap preview.")


if __name__ == "__main__":
    main()
