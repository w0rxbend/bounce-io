import assert from "node:assert/strict";
import test from "node:test";
import { hudRectsOverlap, layoutHud, type HudRect } from "../../apps/client/src/hudLayout.js";

function inside(inner: HudRect, outer: HudRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

test("responsive HUD regions remain inside safe bounds without critical overlaps", () => {
  const cases = [
    { width: 320, height: 240 }, { width: 360, height: 240 }, { width: 390, height: 844 },
    { width: 667, height: 375 }, { width: 760, height: 520 }, { width: 1280, height: 720 },
    { width: 844, height: 390, safeInsets: { left: 47, right: 47, bottom: 21 } },
  ];
  for (const dimensions of cases) {
    const layout = layoutHud({ ...dimensions, hasShield: true, offline: true, chatCount: 8, emoteCount: 5 });
    for (const region of [layout.stats, layout.connection, layout.phase, layout.chat, layout.emotes].filter(Boolean) as HudRect[]) {
      assert.ok(inside(region, layout.safe), `${dimensions.width}x${dimensions.height}: ${JSON.stringify(region)} outside ${JSON.stringify(layout.safe)}`);
    }
    assert.equal(hudRectsOverlap(layout.stats, layout.connection), false);
    assert.equal(hudRectsOverlap(layout.stats, layout.phase), false);
    assert.equal(hudRectsOverlap(layout.connection, layout.phase), false);
    if (layout.chat && layout.emotes) assert.equal(hudRectsOverlap(layout.chat, layout.emotes), false);
    if (layout.density === "micro") {
      assert.ok(layout.chatRows <= 2);
      assert.equal(layout.emotes, null);
    }
  }
});

test("HUD density thresholds are deterministic", () => {
  const base = { hasShield: false, offline: false, chatCount: 0, emoteCount: 5 };
  assert.equal(layoutHud({ ...base, width: 479, height: 600 }).density, "micro");
  assert.equal(layoutHud({ ...base, width: 480, height: 359 }).density, "micro");
  assert.equal(layoutHud({ ...base, width: 480, height: 360 }).density, "compact");
  assert.equal(layoutHud({ ...base, width: 760, height: 520 }).density, "wide");
});
