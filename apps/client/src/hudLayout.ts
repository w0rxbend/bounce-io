export interface HudInsets { top: number; right: number; bottom: number; left: number }
export interface HudRect { x: number; y: number; width: number; height: number }
export type HudDensity = "wide" | "compact" | "micro";

export interface HudLayoutInput {
  width: number;
  height: number;
  safeInsets?: Partial<HudInsets>;
  hasShield: boolean;
  offline: boolean;
  chatCount: number;
  emoteCount: number;
  scale?: number;
}

export interface HudLayout {
  density: HudDensity;
  safe: HudRect;
  stats: HudRect;
  connection: HudRect;
  phase: HudRect;
  chat: HudRect | null;
  emotes: HudRect | null;
  chatRows: number;
}

function finiteInset(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function rect(x: number, y: number, width: number, height: number): HudRect {
  return { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

export function layoutHud(input: HudLayoutInput): HudLayout {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const scale = Math.max(0.5, input.scale ?? 1.14);
  const insets = {
    top: finiteInset(input.safeInsets?.top), right: finiteInset(input.safeInsets?.right),
    bottom: finiteInset(input.safeInsets?.bottom), left: finiteInset(input.safeInsets?.left),
  };
  const safe = rect(insets.left, insets.top, Math.max(1, width - insets.left - insets.right), Math.max(1, height - insets.top - insets.bottom));
  const density: HudDensity = width < 480 || height < 360 ? "micro" : width < 760 || height < 520 ? "compact" : "wide";
  const margin = Math.round(10 * scale);
  const gap = Math.max(5, Math.round(6 * scale));
  const hasShield = input.hasShield;

  let stats: HudRect;
  let connection: HudRect;
  let phase: HudRect;
  if (density === "micro") {
    stats = rect(safe.x + margin, safe.y + margin, Math.min(360, safe.width - margin * 2), hasShield ? 68 : 58);
    const badgeW = Math.min(input.offline ? 135 : 88, safe.width - margin * 2);
    connection = rect(safe.x + safe.width - margin - badgeW, stats.y + stats.height + gap, badgeW, 30);
    phase = rect(safe.x + margin, connection.y, Math.max(1, connection.x - safe.x - margin * 2), 30);
  } else {
    stats = rect(safe.x + margin, safe.y + margin, Math.min(density === "compact" ? 253 : 326, safe.width - margin * 2), hasShield ? 201 : 169);
    const badgeW = Math.min(input.offline ? (density === "wide" ? 262 : 135) : (density === "wide" ? 171 : 88), safe.width - margin * 2);
    const fitsRight = stats.x + stats.width + gap + badgeW <= safe.x + safe.width - margin;
    connection = fitsRight
      ? rect(safe.x + safe.width - margin - badgeW, safe.y + margin, badgeW, 32)
      : rect(safe.x + safe.width - margin - badgeW, stats.y + stats.height + gap, badgeW, 32);
    phase = density === "wide"
      ? rect(stats.x + stats.width + gap, safe.y + margin, Math.max(1, connection.x - stats.x - stats.width - gap * 2), 24)
      : fitsRight
        ? rect(stats.x + stats.width + gap, safe.y + margin, Math.max(1, connection.x - stats.x - stats.width - gap * 2), 32)
        : rect(safe.x + margin, connection.y, Math.max(1, connection.x - safe.x - margin * 2), 32);
  }

  const chatRows = density === "micro" ? Math.min(2, input.chatCount) : density === "compact" ? Math.min(4, input.chatCount) : Math.min(8, input.chatCount);
  const chatWidth = density === "micro" ? Math.min(180, safe.width * 0.45) : density === "compact" ? Math.min(260, safe.width * 0.42) : Math.min(365, safe.width * 0.3);
  const chatHeight = 34 + Math.max(1, chatRows) * Math.round(14 * scale);
  const chat = input.chatCount > 0 ? rect(safe.x + margin, safe.y + safe.height - margin - chatHeight, chatWidth, chatHeight) : null;
  let emotes: HudRect | null = null;
  if (density !== "micro" && input.emoteCount > 0) {
    const emoteWidth = input.emoteCount * Math.round(34 * scale) + Math.round(12 * scale);
    const emoteHeight = Math.round(30 * scale);
    const preferredX = density === "compact" ? safe.x + safe.width - margin - emoteWidth : safe.x + safe.width / 2 - emoteWidth / 2;
    emotes = rect(preferredX, safe.y + safe.height - margin - emoteHeight, emoteWidth, emoteHeight);
  }
  return { density, safe, stats, connection, phase, chat, emotes, chatRows };
}

export function hudRectsOverlap(a: HudRect, b: HudRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
