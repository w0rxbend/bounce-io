import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const outDir = "apps/client/public/assets/pixel";
const preservedFiles = new Set(["bg_mountain_panorama_887x1774.png"]);
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(outDir)) {
  if (preservedFiles.has(file)) continue;
  if (file.endsWith(".png") || file.endsWith(".svg") || file === "manifest.json" || file === "sprite_atlas.json") {
    rmSync(join(outDir, file));
  }
}

function playerSvg({ pose = "idle", scarf = "back", legA = 0, legB = 0, arm = 0, jacket = "#f3c64b", hair = "#281a10", skin = "#ffd090", accent = "#b83020" } = {}) {
  const kick = pose === "kick";
  const jump = pose === "jump";
  const fall = pose === "fall";
  const bodyY = jump ? 9 : fall ? 11 : 10;
  const headY = jump ? 5 : fall ? 7 : 6;
  const eyeY = headY + 3;
  const scarfPaths = scarf === "forward"
    ? `<path d="M16 ${bodyY + 5}h6v2h-6zM19 ${bodyY + 7}h4v2h-4z" fill="${accent}"/><path d="M21 ${bodyY + 9}h2v2h-2z" fill="#701818"/>`
    : `<path d="M3 ${bodyY + 5}h5v2H3zM1 ${bodyY + 7}h5v2H1z" fill="${accent}"/><path d="M1 ${bodyY + 9}h3v2H1z" fill="#701818"/>`;
  const foot = kick ? `<path d="M17 24h6v4h-6zM17 24h6v1h-6z" fill="${jacket}"/>` : "";
  const armPath = kick
    ? `<path d="M16 ${bodyY + 8}h5v3h-5z" fill="#ffd090"/>`
    : `<path d="M${arm < 0 ? 4 : 16} ${bodyY + 8}h4v3h-4z" fill="#ffd090"/>`;
  return `
      <path d="M4 31h16v1H4z" fill="#000000" opacity=".25"/>
      <path d="M7 ${27 + legA}h4v4H7zM14 ${27 + legB}h4v4h-4z" fill="#1a3818"/>
      <path d="M5 ${bodyY}h14v17H5z" fill="#1c1f2a"/>
      <path d="M7 ${bodyY + 2}h10v13H7z" fill="${jacket}"/>
      <path d="M6 ${headY}h12v8H6z" fill="${skin}"/>
      <path d="M6 ${headY - 1}h12v4H6z" fill="${hair}"/>
      <path d="M15 ${eyeY}h2v2h-2z" fill="#1c1f2a"/>
      <path d="M16 ${eyeY}h1v1h-1z" fill="#ffffff"/>
      ${scarfPaths}
      ${armPath}
      ${foot}
      <path d="M4 ${bodyY}h1v17H4zM19 ${bodyY}h1v17h-1zM5 27h15v1H5z" fill="#1c1f2a"/>
    `;
}

function playerVariantSvg(variant = "green") {
  const palette = {
    green: { jacket: "#68c040", hair: "#5a3018", skin: "#ffd090", accent: "#30c8c0" },
    blue: { jacket: "#4088d8", hair: "#1c1f2a", skin: "#f0b078", accent: "#ffe870" },
    red: { jacket: "#d85040", hair: "#702018", skin: "#ffc080", accent: "#40d8f8" },
    violet: { jacket: "#a050c8", hair: "#201030", skin: "#ffd0a0", accent: "#f8c830" },
  }[variant] ?? {};
  return playerSvg({ ...palette });
}

function coinSvg(width = 8) {
  const x = Math.round((16 - width) / 2);
  if (width <= 2) {
    return `
      <path d="M7 2h2v12H7z" fill="#b07020"/>
      <path d="M8 2h1v11H8z" fill="#ffe870"/>
    `;
  }
  return `
      <path d="M${x} 2h${width}v1h2v2h1v6h-1v2h-2v1h-${width}v-1h-2v-2H${x - 3}V5h1V3h2z" fill="#b07020"/>
      <path d="M${x + 1} 2h${Math.max(1, width - 1)}v1h2v3h1v4h-1v2h-2v1h-${Math.max(1, width - 1)}v-1h-2v-2H${x - 2}V6h1V3h2z" fill="#f8c830"/>
      <path d="M${x + 1} 3h${Math.max(1, width - 2)}v2H${x + 1}zM${x} 5h2v2H${x}z" fill="#ffe870"/>
      <path d="M${x + width - 1} 5h2v6h-2z" fill="#b07020"/>
    `;
}

function platformSvg({ variant = "normal", w = 32 } = {}) {
  const cracked = variant === "cracked";
  const overhang = variant === "overhang";
  const flowers = variant === "flowers";
  const roots = variant === "roots";
  const runes = variant === "runes";
  return `
      <path d="M0 3h${w}v13H0z" fill="#26354a"/>
      <path d="M1 4h${w - 2}v11H1z" fill="${runes ? "#526985" : cracked ? "#5a6f8a" : "#4c5e78"}"/>
      <path d="M1 4h${w - 2}v2H1z" fill="#657c9a"/>
      <path d="M1 1h${w - 2}v4H1z" fill="#a8c4dc"/>
      <path d="M2 0h${Math.max(1, w - 5)}v3H2z" fill="#e9f2ff"/>
      <path d="M0 2h6v3H0zM9 1h8v3H9zM20 2h7v3h-7z${w > 32 ? `M32 1h8v3h-8zM42 2h5v3h-5z` : ""}" fill="#f8fbff"/>
      <path d="M4 4h5v1H4zM13 3h7v1h-7zM${Math.max(22, w - 8)} 4h5v1h-5z" fill="#b8d4ee"/>
      <path d="M2 9h12v1H2zM17 8h${Math.max(8, w - 19)}v1H17zM8 5h1v4H8zM22 9h1v5h-1z" fill="#26354a" opacity=".58"/>
      <path d="M4 7h4v2H4zM${Math.max(18, w - 13)} 6h5v2h-${5}z" fill="#6d8c47"/>
      <path d="M5 6h3v1H5zM${Math.max(19, w - 12)} 5h3v1h-${3}z" fill="#7d9a5b"/>
      <path d="M3 11h4v1H3zM11 12h3v1h-3zM${Math.max(18, w - 10)} 11h6v1h-${6}z" fill="#3b4c64" opacity=".8"/>
      ${cracked ? `<path d="M13 6h1v4h1v3h-1v2h-1v-4h-1V8h1zM${w - 9} 7h1v5h-1z" fill="#1a2536" opacity=".78"/><path d="M12 5h4v1h-4zM${w - 11} 6h4v1h-4z" fill="#e9f2ff"/>` : ""}
      ${overhang ? `<path d="M2 14h4v3H2zM10 14h3v4h-3zM${w - 8} 14h5v3h-5z" fill="#1a2536"/><path d="M4 16h1v5H4zM${w - 6} 16h1v4h-1z" fill="#6d8c47"/><path d="M4 16h1v1H4zM${w - 6} 16h1v1h-1z" fill="#e9f2ff"/>` : ""}
      ${flowers ? `<path d="M6 -2h1v2H6zM7 -3h2v2H7zM${w - 9} -2h1v2h-1zM${w - 8} -3h2v2h-2z" fill="#ffffff"/><path d="M15 -2h1v2h-1zM16 -3h2v2h-2z" fill="#e2b84f"/><path d="M21 -2h1v2h-1zM22 -3h2v2h-2z" fill="#b7a2ee"/>` : ""}
      ${roots ? `<path d="M4 15h2v5H4zM7 15h1v3H7zM17 15h2v6h-2zM24 15h1v4h-1zM27 15h2v5h-2z" fill="#26354a"/><path d="M5 19h4v1H5zM18 20h5v1h-5zM27 19h3v1h-3z" fill="#6d8c47"/>` : ""}
      ${runes ? `<path d="M7 8h3v1H7zM8 6h1v5H8zM18 7h5v1h-5zM20 7h1v5h-1zM24 10h2v1h-2z" fill="#55b6ff" opacity=".88"/><path d="M8 7h1v1H8zM20 8h1v1h-1z" fill="#e9f2ff"/>` : ""}
      <path d="M6 14h1v2H6zM15 14h1v2h-1zM${w - 7} 14h1v2h-1z" fill="#1a2536"/>
    `;
}

function cloudSvg({ w = 96, h = 40, mood = "warm" } = {}) {
  const bright = mood === "far" ? "#a8c0d8" : "#f0e8d8";
  const mid = mood === "far" ? "#6888b8" : "#a8c0d8";
  const shade = "#8898b8";
  return `
      <path d="M0 0h${w}v${h}H0z" fill="#000000" opacity="0"/>
      <path d="M${Math.round(w * 0.05)} ${Math.round(h * 0.55)}h${Math.round(w * 0.18)}v-${Math.round(h * 0.18)}h${Math.round(w * 0.14)}v-${Math.round(h * 0.13)}h${Math.round(w * 0.22)}v${Math.round(h * 0.12)}h${Math.round(w * 0.18)}v${Math.round(h * 0.16)}h${Math.round(w * 0.18)}v${Math.round(h * 0.28)}H${Math.round(w * 0.05)}z" fill="${shade}" opacity=".55"/>
      <path d="M${Math.round(w * 0.07)} ${Math.round(h * 0.48)}h${Math.round(w * 0.18)}v-${Math.round(h * 0.22)}h${Math.round(w * 0.15)}v-${Math.round(h * 0.14)}h${Math.round(w * 0.20)}v${Math.round(h * 0.14)}h${Math.round(w * 0.18)}v${Math.round(h * 0.17)}h${Math.round(w * 0.19)}v${Math.round(h * 0.25)}H${Math.round(w * 0.07)}z" fill="${mid}" opacity=".75"/>
      <path d="M${Math.round(w * 0.13)} ${Math.round(h * 0.40)}h${Math.round(w * 0.17)}v-${Math.round(h * 0.20)}h${Math.round(w * 0.16)}v-${Math.round(h * 0.12)}h${Math.round(w * 0.16)}v${Math.round(h * 0.16)}h${Math.round(w * 0.17)}v${Math.round(h * 0.15)}h${Math.round(w * 0.13)}v${Math.round(h * 0.18)}H${Math.round(w * 0.13)}z" fill="${bright}" opacity=".86"/>
      <path d="M${Math.round(w * 0.18)} ${Math.round(h * 0.34)}h${Math.round(w * 0.12)}v-${Math.round(h * 0.09)}h${Math.round(w * 0.18)}v-${Math.round(h * 0.07)}h${Math.round(w * 0.12)}v${Math.round(h * 0.10)}h${Math.round(w * 0.16)}v${Math.round(h * 0.08)}h${Math.round(w * 0.10)}v${Math.round(h * 0.08)}H${Math.round(w * 0.18)}z" fill="#fffff0" opacity=".5"/>
    `;
}

function gemSvg({ main = "#40d8f8", light = "#a0f0ff", shade = "#12485a", shape = "diamond" } = {}) {
  if (shape === "star") {
    return `
      <path d="M7 1h2v4h4v2h-3v2h2v2H9v4H7v-4H4V9h2V7H3V5h4z" fill="${shade}"/>
      <path d="M8 1h1v5h4v1H9v3h3v1H9v4H8v-4H4v-1h3V7H3V6h5z" fill="${main}"/>
      <path d="M8 2h1v3h2v1H8z" fill="${light}"/>
    `;
  }
  if (shape === "seed") {
    return `
      <path d="M5 3h6v2h2v6h-2v2H5v-2H3V5h2z" fill="${shade}"/>
      <path d="M6 3h5v2h2v5h-2v2H6v-2H4V5h2z" fill="${main}"/>
      <path d="M7 4h3v2H7zM5 6h2v2H5z" fill="${light}"/>
      <path d="M9 1h4v2H9z" fill="#68c040"/>
    `;
  }
  return `
      <path d="M8 1h2l4 5-2 8H4L2 6l4-5z" fill="${shade}"/>
      <path d="M8 2h2l3 4-2 7H5L3 6l3-4z" fill="${main}"/>
      <path d="M7 3h3l1 3-2 1H6L5 6z" fill="${light}"/>
      <path d="M5 11h6v1H5z" fill="#ffffff" opacity=".45"/>
    `;
}

function lanternSvg({ flame = "#ffe870", glow = "#40d8f8", post = false } = {}) {
  const pole = post ? `<path d="M7 22h3v18H7zM3 38h11v2H3z" fill="#402818"/><path d="M8 22h2v16H8z" fill="#8a5a30"/>` : "";
  const y = post ? 2 : 0;
  return `
      ${pole}
      <path d="M7 ${y}h2v4H7zM4 ${y + 3}h8v2H4z" fill="#402818"/>
      <path d="M3 ${y + 5}h11v13H3z" fill="#28221a"/>
      <path d="M5 ${y + 6}h7v11H5z" fill="#0b3048"/>
      <path d="M6 ${y + 7}h5v9H6z" fill="${glow}" opacity=".74"/>
      <path d="M7 ${y + 8}h3v7H7z" fill="${flame}" opacity=".9"/>
      <path d="M2 ${y + 18}h13v2H2zM5 ${y + 20}h7v2H5z" fill="#402818"/>
      <path d="M1 ${y + 8}h2v7H1zM14 ${y + 8}h2v7h-2z" fill="${glow}" opacity=".16"/>
    `;
}

function fireflySvg(frame = 0) {
  const glow = frame % 2 === 0 ? ".65" : ".34";
  return `
      <path d="M0 0h16v16H0z" fill="#000000" opacity="0"/>
      <path d="M5 7h6v3H5z" fill="#403018"/>
      <path d="M7 6h2v5H7z" fill="#281a10"/>
      <path d="M2 4h5v3H2zM9 4h5v3H9z" fill="#d8ffff" opacity=".38"/>
      <path d="M5 5h6v6H5z" fill="#ffe870" opacity="${glow}"/>
      <path d="M7 7h2v2H7z" fill="#ffffff" opacity=".9"/>
    `;
}

function fogSvg({ w = 256, h = 64 } = {}) {
  return `
      <path d="M0 0h${w}v${h}H0z" fill="#000000" opacity="0"/>
      <path d="M0 28h48v-8h76v8h92v-7h40v22H0z" fill="#d8fff0" opacity=".18"/>
      <path d="M18 40h64v-6h92v5h64v15H18z" fill="#ffffff" opacity=".14"/>
      <path d="M0 51h70v-4h80v4h106v10H0z" fill="#a0f0ff" opacity=".11"/>
    `;
}

function planksSvg({ broken = false } = {}) {
  return `
      <path d="M1 6h38v8H1zM5 15h34v7H5z" fill="#402818"/>
      <path d="M2 5h36v8H2zM6 14h32v7H6z" fill="#b88048"/>
      <path d="M3 6h33v2H3zM7 15h29v2H7z" fill="#d8a060"/>
      <path d="M8 5h1v8H8zM20 5h1v8h-1zM31 5h1v8h-1zM15 14h1v7h-1zM28 14h1v7h-1z" fill="#6a4820"/>
      ${broken ? `<path d="M34 5h5v4h-5zM35 16h4v5h-4zM1 11h6v3H1z" fill="#000000" opacity="0"/>` : ""}
      <path d="M6 9h2v1H6zM24 17h2v1h-2zM33 8h2v1h-2z" fill="#402818"/>
    `;
}

function flowerPotSvg({ flower = "#ffaabb", pot = "#a85828", hanging = false } = {}) {
  const hanger = hanging ? `<path d="M7 0h2v4H7zM4 3h8v1H4zM4 4h1v5H4zM11 4h1v5h-1z" fill="#402818"/>` : "";
  const y = hanging ? 7 : 3;
  return `
      ${hanger}
      <path d="M6 ${y + 2}h2v8H6zM10 ${y + 1}h2v9h-2z" fill="#2e6840"/>
      <path d="M3 ${y + 10}h13v3H3zM4 ${y + 13}h11v7H4z" fill="#5a2f20"/>
      <path d="M4 ${y + 9}h11v3H4zM5 ${y + 12}h9v7H5z" fill="${pot}"/>
      <path d="M6 ${y + 13}h7v2H6z" fill="#d08038"/>
      <path d="M4 ${y + 1}h4v3H4zM9 ${y}h5v4H9zM7 ${y + 3}h4v3H7z" fill="${flower}"/>
      <path d="M6 ${y + 2}h1v1H6zM11 ${y + 1}h1v1h-1zM9 ${y + 4}h1v1H9z" fill="#ffe870"/>
      <path d="M5 ${y + 6}h4v2H5zM10 ${y + 5}h4v2h-4z" fill="#68c040"/>
    `;
}

function logSvg() {
  return `
      <path d="M3 10h36v10H3z" fill="#402818"/>
      <path d="M5 8h32v10H5z" fill="#8a5a30"/>
      <path d="M7 8h27v2H7zM8 14h26v1H8z" fill="#d8a060"/>
      <path d="M2 10h8v10H2zM33 8h8v10h-8z" fill="#281a10"/>
      <path d="M4 11h5v7H4zM34 9h5v7h-5z" fill="#b88048"/>
      <path d="M5 12h3v4H5zM35 10h3v4h-3z" fill="#583a20"/>
    `;
}

const assets = [
  {
    name: "bg_sky_arches_768x432",
    w: 768,
    h: 432,
    svg: `
      <path d="M0 0h768v432H0z" fill="#000000" opacity="0"/>
      <path d="M0 336h768v96H0z" fill="#26354a" opacity=".08"/>
      <path d="M28 326h124v10H28zM226 300h146v10H226zM470 316h174v10H470z" fill="#4c5e78" opacity=".26"/>
      <path d="M48 310h82v16H48zM244 282h108v18H244zM496 296h122v20H496z" fill="#26354a" opacity=".22"/>
      <path d="M65 246h22v80H65zM111 258h18v68h-18zM263 214h24v86h-24zM326 226h18v74h-18zM520 232h24v84h-24zM592 220h26v96h-26z" fill="#26354a" opacity=".30"/>
      <path d="M58 238h80v9H58zM252 205h104v10H252zM504 212h126v11H504z" fill="#4c5e78" opacity=".34"/>
      <path d="M69 232h16l8 7H61zM272 194h18l10 12h-40zM534 200h18l14 13h-48zM594 205h18l13 8h-42z" fill="#e9f2ff" opacity=".42"/>
      <path d="M77 252h6v20h-6zM118 270h6v18h-6zM273 226h7v24h-7zM331 240h6v20h-6zM531 244h7v25h-7zM601 236h8v27h-8z" fill="#55b6ff" opacity=".22"/>
      <path d="M75 254h10v2H75zM271 229h11v2h-11zM529 247h11v2h-11zM599 239h12v2h-12z" fill="#e9f2ff" opacity=".24"/>
      <path d="M40 333h132v5H40zM218 307h164v6H218zM458 323h200v6H458z" fill="#e9f2ff" opacity=".34"/>
      <path d="M52 338h104v4H52zM236 313h130v4H236zM486 329h146v5H486z" fill="#a8c4dc" opacity=".22"/>
      <path d="M34 354h150v6H34zM210 334h190v6H210zM446 348h230v7H446z" fill="#1a2536" opacity=".14"/>
      <path d="M88 314h12v3H88zM286 290h15v3h-15zM566 304h18v3h-18z" fill="#7d9a5b" opacity=".22"/>
    `,
  },
  {
    name: "bg_cloud_bank_768x128",
    w: 768,
    h: 128,
    svg: `
      <path d="M0 0h768v128H0z" fill="#000000" opacity="0"/>
      <path d="M0 84h768v44H0z" fill="#26354a" opacity=".16"/>
      <path d="M18 78h92V58h56V44h86v20h72v16h96V60h70V46h90v22h82v16h88v30H18z" fill="#7894b4" opacity=".46"/>
      <path d="M0 70h110V50h66V36h90v22h78v14h94V52h80V38h94v20h84v17h72v30H0z" fill="#a8c4dc" opacity=".68"/>
      <path d="M32 60h82V42h62V28h76v20h72v12h82V42h78V30h80v20h76v13h90v22H32z" fill="#e9f2ff" opacity=".82"/>
      <path d="M62 52h48V42h54V34h62v12h58v8h72V46h74V36h58v10h68v8h56v8H62z" fill="#ffffff" opacity=".52"/>
      <path d="M12 96h160v9H12zM196 91h138v8H196zM382 97h172v8H382zM596 88h150v9H596z" fill="#4c5e78" opacity=".16"/>
      <path d="M66 112h95v4H66zM240 108h110v4H240zM455 113h120v4H455zM638 104h88v4H638z" fill="#55b6ff" opacity=".08"/>
    `,
  },
  {
    name: "grass_clump_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M1 13h14v2H1z" fill="#2e6840"/>
      <path d="M2 9h2v4H2zM5 6h2v7H5zM8 8h2v5H8zM12 7h2v6h-2z" fill="#68c040"/>
      <path d="M3 10h1v2H3zM6 7h1v3H6zM9 9h1v2H9zM13 8h1v3h-1z" fill="#a8e85c"/>
    `,
  },
  {
    name: "signpost_16x24",
    w: 16,
    h: 24,
    svg: `
      <path d="M7 8h3v15H7z" fill="#402818"/>
      <path d="M8 8h3v15H8z" fill="#6a4820"/>
      <path d="M2 3h12v8H2z" fill="#28221a"/>
      <path d="M3 2h10v8H3z" fill="#b88048"/>
      <path d="M4 3h8v2H4z" fill="#d8a060"/>
      <path d="M5 6h5v1H5zM10 7h2v1h-2z" fill="#402818"/>
      <path d="M6 22h6v2H6z" fill="#28221a"/>
    `,
  },
  {
    name: "fence_32x16",
    w: 32,
    h: 16,
    svg: `
      <path d="M3 3h4v13H3zM14 2h4v14h-4zM25 3h4v13h-4z" fill="#402818"/>
      <path d="M4 3h3v11H4zM15 2h3v12h-3zM26 3h3v11h-3z" fill="#8a5a30"/>
      <path d="M1 6h30v3H1zM0 11h31v3H0z" fill="#402818"/>
      <path d="M2 5h29v3H2zM1 10h29v3H1z" fill="#b88048"/>
      <path d="M4 5h5v1H4zM17 10h6v1h-6z" fill="#d8a060"/>
    `,
  },
  {
    name: "rope_bridge_48x16",
    w: 48,
    h: 16,
    svg: `
      <path d="M0 4h48v2H0zM0 13h48v2H0z" fill="#402818"/>
      <path d="M3 6h6v7H3zM12 6h6v7h-6zM21 6h6v7h-6zM30 6h6v7h-6zM39 6h6v7h-6z" fill="#8a5a30"/>
      <path d="M4 6h4v1H4zM13 6h4v1h-4zM22 6h4v1h-4zM31 6h4v1h-4zM40 6h4v1h-4z" fill="#d8a060"/>
      <path d="M6 2h1v12H6zM23 2h1v12h-1zM40 2h1v12h-1z" fill="#583a20"/>
    `,
  },
  {
    name: "stump_24x24",
    w: 24,
    h: 24,
    svg: `
      <path d="M7 7h11v14H7z" fill="#402818"/>
      <path d="M8 6h10v14H8z" fill="#6a4820"/>
      <path d="M6 5h13v5H6z" fill="#281a10"/>
      <path d="M7 4h12v5H7z" fill="#8a5a30"/>
      <path d="M9 5h7v2H9z" fill="#d8a060"/>
      <path d="M5 20h15v3H5z" fill="#1a3818"/>
      <path d="M4 18h4v3H4zM16 17h4v4h-4z" fill="#489030"/>
    `,
  },
  {
    name: "ruin_column_24x40",
    w: 24,
    h: 40,
    svg: `
      <path d="M5 6h14v32H5z" fill="#28221a"/>
      <path d="M7 7h10v30H7z" fill="#6a5840"/>
      <path d="M4 4h16v5H4zM3 34h18v5H3z" fill="#28221a"/>
      <path d="M5 3h14v5H5zM5 33h14v5H5z" fill="#907858"/>
      <path d="M8 10h2v20H8zM14 10h2v20h-2z" fill="#504030"/>
      <path d="M8 8h7v1H8zM7 33h10v1H7z" fill="#c8a878" opacity=".7"/>
      <path d="M6 12h4v2H6zM15 22h3v2h-3zM8 31h5v2H8z" fill="#489030"/>
    `,
  },
  {
    name: "crystal_marker_16x24",
    w: 16,
    h: 24,
    svg: `
      <path d="M6 2h4l3 6-2 10H5L3 8z" fill="#12485a"/>
      <path d="M7 2h3l2 6-2 8H6L4 8z" fill="#40d8f8"/>
      <path d="M8 3h2l1 5-1 5H8z" fill="#a0f0ff"/>
      <path d="M3 18h10v4H3z" fill="#504030"/>
      <path d="M2 21h12v2H2z" fill="#28221a"/>
    `,
  },
  {
    name: "bush_32",
    w: 32,
    h: 24,
    svg: `
      <path d="M3 14h4v-4h5V7h7v3h6v4h4v7H3z" fill="#1a3818"/>
      <path d="M5 13h5V9h7V6h5v4h5v4h3v5H5z" fill="#2e6840"/>
      <path d="M7 12h5V8h5V5h4v4h5v4h2v3H7z" fill="#489030"/>
      <path d="M9 10h3V8h4V6h3v3h4v3h2v2H9z" fill="#68c040"/>
      <path d="M6 19h22v3H6z" fill="#10240f"/>
    `,
  },
  {
    name: "tree_48",
    w: 48,
    h: 64,
    svg: `
      <path d="M21 33h8v27h-8z" fill="#402818"/>
      <path d="M25 38h7v22h-7z" fill="#6a4820"/>
      <path d="M19 47h7v4h-7zM28 44h8v4h-8z" fill="#583a20"/>
      <path d="M4 25h8v-9h8V8h16v8h8v10h-6v8H10v-9z" fill="#1a3818"/>
      <path d="M7 23h8v-8h8V7h11v8h8v9h-6v7H12v-8z" fill="#2e6840"/>
      <path d="M10 20h8v-7h8V5h8v8h6v7h-5v7H14v-7z" fill="#489030"/>
      <path d="M14 17h6v-5h7V8h5v6h5v5h-4v4H17v-5z" fill="#78d050"/>
    `,
  },
  {
    name: "moss_platform_32",
    w: 32,
    h: 16,
    svg: platformSvg(),
  },
  {
    name: "moss_platform_cracked_32",
    w: 32,
    h: 16,
    svg: platformSvg({ variant: "cracked" }),
  },
  {
    name: "moss_platform_overhang_32",
    w: 32,
    h: 22,
    svg: platformSvg({ variant: "overhang" }),
  },
  {
    name: "moss_platform_flowers_32",
    w: 32,
    h: 18,
    svg: platformSvg({ variant: "flowers" }),
  },
  {
    name: "stone_ledge_48",
    w: 48,
    h: 18,
    svg: platformSvg({ variant: "cracked", w: 48 }),
  },
  {
    name: "moss_platform_roots_32",
    w: 32,
    h: 22,
    svg: platformSvg({ variant: "roots" }),
  },
  {
    name: "moss_platform_runes_32",
    w: 32,
    h: 18,
    svg: platformSvg({ variant: "runes" }),
  },
  {
    name: "coin_16",
    w: 16,
    h: 16,
    svg: coinSvg(8),
  },
  { name: "coin_spin_0_16", w: 16, h: 16, svg: coinSvg(8) },
  { name: "coin_spin_1_16", w: 16, h: 16, svg: coinSvg(5) },
  { name: "coin_spin_2_16", w: 16, h: 16, svg: coinSvg(2) },
  { name: "coin_spin_3_16", w: 16, h: 16, svg: coinSvg(5) },
  { name: "gem_cyan_0_16", w: 16, h: 16, svg: gemSvg() },
  { name: "gem_cyan_1_16", w: 16, h: 16, svg: gemSvg({ main: "#40d8f8", light: "#e8ffff", shade: "#12485a" }) },
  { name: "gem_cyan_2_16", w: 16, h: 16, svg: gemSvg({ main: "#2aa8d8", light: "#a0f0ff", shade: "#0b3048" }) },
  { name: "gem_cyan_3_16", w: 16, h: 16, svg: gemSvg({ main: "#40d8f8", light: "#ffffff", shade: "#12485a" }) },
  { name: "relic_pink_0_16", w: 16, h: 16, svg: gemSvg({ main: "#e878c8", light: "#ffd0f0", shade: "#743060" }) },
  { name: "relic_pink_1_16", w: 16, h: 16, svg: gemSvg({ main: "#d860b8", light: "#fff0ff", shade: "#743060" }) },
  { name: "relic_pink_2_16", w: 16, h: 16, svg: gemSvg({ main: "#b840a0", light: "#ffd0f0", shade: "#5a204a" }) },
  { name: "relic_pink_3_16", w: 16, h: 16, svg: gemSvg({ main: "#e878c8", light: "#ffffff", shade: "#743060" }) },
  { name: "seed_green_0_16", w: 16, h: 16, svg: gemSvg({ main: "#68c040", light: "#a8e85c", shade: "#1a3818", shape: "seed" }) },
  { name: "seed_green_1_16", w: 16, h: 16, svg: gemSvg({ main: "#78d050", light: "#d8ff90", shade: "#1a3818", shape: "seed" }) },
  { name: "seed_green_2_16", w: 16, h: 16, svg: gemSvg({ main: "#489030", light: "#a8e85c", shade: "#10240f", shape: "seed" }) },
  { name: "seed_green_3_16", w: 16, h: 16, svg: gemSvg({ main: "#68c040", light: "#ffffff", shade: "#1a3818", shape: "seed" }) },
  { name: "star_shard_0_16", w: 16, h: 16, svg: gemSvg({ main: "#ffe870", light: "#ffffff", shade: "#b07020", shape: "star" }) },
  { name: "star_shard_1_16", w: 16, h: 16, svg: gemSvg({ main: "#f8c830", light: "#fff3a8", shade: "#b07020", shape: "star" }) },
  { name: "star_shard_2_16", w: 16, h: 16, svg: gemSvg({ main: "#d8a020", light: "#ffe870", shade: "#704010", shape: "star" }) },
  { name: "star_shard_3_16", w: 16, h: 16, svg: gemSvg({ main: "#ffe870", light: "#ffffff", shade: "#b07020", shape: "star" }) },
  {
    name: "collectible_sparkle_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M7 0h2v5h5v2H9v5H7V7H2V5h5z" fill="#ffffff" opacity=".85"/>
      <path d="M3 11h2v2H3zM12 3h2v2h-2zM11 12h1v1h-1z" fill="#a0f0ff"/>
    `,
  },
  {
    name: "collectible_ring_24",
    w: 24,
    h: 24,
    svg: `
      <path d="M10 1h4v2h-4zM5 4h3v2H5zM16 4h3v2h-3zM3 9h2v6H3zM19 9h2v6h-2zM5 18h3v2H5zM16 18h3v2h-3zM10 21h4v2h-4z" fill="#a0f0ff" opacity=".72"/>
      <path d="M8 3h2v1H8zM14 3h2v1h-2zM4 7h1v2H4zM19 7h1v2h-1zM4 15h1v2H4zM19 15h1v2h-1zM8 20h2v1H8zM14 20h2v1h-2z" fill="#ffffff" opacity=".9"/>
    `,
  },
  {
    name: "hazard_spikes_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M0 11h16v5H0z" fill="#3a1a10"/>
      <path d="M0 11h16v1H0z" fill="#e84030"/>
      <path d="M1 11 4 1l3 10zM6 11 8 3l3 8zM10 11l3-10 3 10z" fill="#e84030"/>
      <path d="M3 4h2v5H3zM8 5h1v4H8zM13 4h1v5h-1z" fill="#ffa060"/>
      <path d="M4 1h1v1H4zM8 3h1v1H8zM13 1h1v1h-1z" fill="#ffffff"/>
    `,
  },
  {
    name: "vine_hanging_16",
    w: 16,
    h: 24,
    svg: `
      <path d="M7 0h2v22H7z" fill="#489030"/>
      <path d="M6 4h4v1H6zM5 10h3v1H5zM8 15h4v1H8zM6 20h3v1H6z" fill="#68c040"/>
      <path d="M4 5h3v2H4zM10 14h3v2h-3zM3 19h3v2H3z" fill="#2e6840"/>
    `,
  },
  {
    name: "flower_patch_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M2 13h12v2H2z" fill="#2e6840"/>
      <path d="M4 9h1v4H4zM8 8h1v5H8zM12 10h1v3h-1z" fill="#489030"/>
      <path d="M3 8h3v2H3z" fill="#ffaabb"/>
      <path d="M7 7h3v2H7z" fill="#ffe870"/>
      <path d="M11 9h3v2h-3z" fill="#ffffff"/>
    `,
  },
  {
    name: "leaf_cluster_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M2 11h12v3H2z" fill="#1a3818"/>
      <path d="M3 8h4v3H3zM7 5h5v4H7zM10 9h4v3h-4z" fill="#489030"/>
      <path d="M4 7h3v2H4zM8 4h4v3H8zM11 8h3v2h-3z" fill="#78d050"/>
      <path d="M6 10h5v1H6z" fill="#2e6840"/>
    `,
  },
  {
    name: "mushroom_cluster_24",
    w: 24,
    h: 20,
    svg: `
      <path d="M5 10h4v8H5zM14 8h4v10h-4z" fill="#f0d0a8"/>
      <path d="M2 7h10v5H2zM11 4h10v6H11z" fill="#b840a0"/>
      <path d="M4 6h6v2H4zM13 3h6v2h-6z" fill="#e878c8"/>
      <path d="M5 8h2v1H5zM15 5h2v1h-2zM19 7h1v1h-1z" fill="#ffd0f0"/>
      <path d="M2 18h20v2H2z" fill="#1a3818"/>
    `,
  },
  {
    name: "pebble_cluster_16",
    w: 16,
    h: 12,
    svg: `
      <path d="M1 8h5v3H1zM6 5h6v5H6zM11 7h4v4h-4z" fill="#28221a"/>
      <path d="M2 7h4v3H2zM7 4h5v5H7zM12 6h3v4h-3z" fill="#907858"/>
      <path d="M3 7h2v1H3zM8 4h3v1H8zM12 6h2v1h-2z" fill="#c8a878"/>
    `,
  },
  {
    name: "lantern_cyan_16x24",
    w: 16,
    h: 24,
    svg: `
      <path d="M7 0h2v5H7zM5 4h6v2H5z" fill="#402818"/>
      <path d="M4 6h9v12H4z" fill="#28221a"/>
      <path d="M5 7h7v10H5z" fill="#0b3048"/>
      <path d="M6 8h5v8H6z" fill="#40d8f8" opacity=".82"/>
      <path d="M7 8h2v8H7z" fill="#a0f0ff" opacity=".9"/>
      <path d="M3 18h11v2H3zM6 20h5v2H6z" fill="#402818"/>
    `,
  },
  {
    name: "ruin_arch_fragment_32",
    w: 32,
    h: 32,
    svg: `
      <path d="M3 10h6v20H3zM23 8h6v22h-6zM7 4h18v6H7z" fill="#28221a"/>
      <path d="M5 11h4v17H5zM23 9h4v19h-4zM8 5h16v4H8z" fill="#6a5840"/>
      <path d="M8 13h16v17H8z" fill="#000000" opacity=".24"/>
      <path d="M10 6h4v2h-4zM18 6h4v2h-4zM5 12h4v2H5zM24 12h3v2h-3z" fill="#c8a878" opacity=".65"/>
      <path d="M4 19h4v2H4zM22 21h5v2h-5zM11 8h3v2h-3z" fill="#489030"/>
    `,
  },
  {
    name: "rune_stone_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M1 2h14v13H1z" fill="#28221a"/>
      <path d="M2 2h12v12H2z" fill="#6a5840"/>
      <path d="M3 3h10v1H3zM4 9h8v1H4z" fill="#907858" opacity=".65"/>
      <path d="M7 5h2v7H7zM5 7h6v2H5z" fill="#30c8c0"/>
      <path d="M6 6h4v1H6zM8 10h3v1H8z" fill="#a0f0ff"/>
    `,
  },
  {
    name: "portal_arch_64",
    w: 64,
    h: 64,
    svg: `
      <path d="M13 19h8v39h-8zM43 19h8v39h-8zM17 11h30v10H17z" fill="#28221a"/>
      <path d="M15 20h7v36h-7zM42 20h7v36h-7zM18 12h28v8H18z" fill="#504030"/>
      <path d="M16 20h5v5h-5zM43 24h5v5h-5zM23 13h7v3h-7zM34 14h8v3h-8z" fill="#907858"/>
      <path d="M22 22h20v34H22z" fill="#0b3048" opacity=".75"/>
      <path d="M25 24h14v30H25z" fill="#40d8f8" opacity=".65"/>
      <path d="M30 22h4v34h-4z" fill="#a0f0ff" opacity=".85"/>
      <path d="M24 33h16v1H24zM26 42h12v1H26zM24 50h16v1H24z" fill="#e8ffff"/>
      <path d="M21 10h5v2h-5zM30 10h5v2h-5zM39 10h4v2h-4z" fill="#30c8c0"/>
      <path d="M14 20h6v2h-6zM44 20h5v2h-5zM19 11h25v1H19z" fill="#c8a878" opacity=".55"/>
      <path d="M14 28h3v2h-3zM45 32h4v2h-4zM24 17h3v2h-3z" fill="#68c040"/>
    `,
  },
  {
    name: "cloud_96",
    w: 96,
    h: 40,
    svg: cloudSvg(),
  },
  {
    name: "cloud_small_64",
    w: 64,
    h: 28,
    svg: cloudSvg({ w: 64, h: 28, mood: "far" }),
  },
  {
    name: "cloud_tall_80",
    w: 80,
    h: 56,
    svg: cloudSvg({ w: 80, h: 56 }),
  },
  {
    name: "cloud_long_144",
    w: 144,
    h: 48,
    svg: cloudSvg({ w: 144, h: 48 }),
  },
  {
    name: "cloud_wispy_128",
    w: 128,
    h: 32,
    svg: cloudSvg({ w: 128, h: 32, mood: "far" }),
  },
  {
    name: "cloud_cluster_160",
    w: 160,
    h: 64,
    svg: cloudSvg({ w: 160, h: 64 }),
  },
  {
    name: "cloud_flat_192",
    w: 192,
    h: 36,
    svg: cloudSvg({ w: 192, h: 36, mood: "far" }),
  },
  {
    name: "cloud_streak_224",
    w: 224,
    h: 32,
    svg: cloudSvg({ w: 224, h: 32, mood: "far" }),
  },
  {
    name: "cloud_puff_112",
    w: 112,
    h: 56,
    svg: cloudSvg({ w: 112, h: 56 }),
  },
  {
    name: "floating_island_96",
    w: 96,
    h: 48,
    svg: `
      <path d="M8 12h80v14H8z" fill="#304068"/>
      <path d="M16 26h64v8H16zM26 34h44v6H26zM38 40h20v5H38z" fill="#222e48"/>
      <path d="M8 10h80v4H8z" fill="#489030"/>
      <path d="M11 8h74v3H11z" fill="#78d050"/>
      <path d="M19 6h3v4h-3zM23 3h10v7H23zM69 5h3v5h-3zM73 2h8v8h-8z" fill="#1a3818"/>
    `,
  },
  {
    name: "crown_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M2 12h12v3H2z" fill="#b07020"/>
      <path d="M3 8h3l2-5 2 5h3l-1 4H4z" fill="#f8c830"/>
      <path d="M4 8h2l2-4 2 4h2l-1 2H5z" fill="#ffe870"/>
      <path d="M7 9h2v2H7z" fill="#40d8f8"/>
    `,
  },
  {
    name: "hud_panel_96",
    w: 96,
    h: 64,
    svg: `
      <path d="M4 6h88v54H4z" fill="#040810"/>
      <path d="M7 4h82v54H7z" fill="#1c1f2a"/>
      <path d="M10 8h76v47H10z" fill="#080e18"/>
      <path d="M10 8h76v2H10z" fill="#40c8d0" opacity=".7"/>
      <path d="M10 10h2v43h-2zM12 10h72v1H12z" fill="#2a4060"/>
      <path d="M8 5h9v4H8zM79 5h9v4h-9zM8 54h9v4H8zM79 54h9v4h-9z" fill="#489030"/>
      <path d="M12 6h4v2h-4zM82 6h3v2h-3zM12 55h3v2h-3zM82 55h4v2h-4z" fill="#68c040"/>
    `,
  },
  {
    name: "player_explorer_24x32",
    w: 24,
    h: 32,
    svg: playerSvg(),
  },
  {
    name: "player_idle_24x32",
    w: 24,
    h: 32,
    svg: playerSvg(),
  },
  {
    name: "player_run_1_24x32",
    w: 24,
    h: 32,
    svg: playerSvg({ pose: "run", legA: -1, legB: 1, arm: -1 }),
  },
  {
    name: "player_run_2_24x32",
    w: 24,
    h: 32,
    svg: playerSvg({ pose: "run", legA: 1, legB: -1, scarf: "forward", arm: 1 }),
  },
  {
    name: "player_jump_24x32",
    w: 24,
    h: 32,
    svg: playerSvg({ pose: "jump", legA: -2, legB: -1, scarf: "forward" }),
  },
  {
    name: "player_fall_24x32",
    w: 24,
    h: 32,
    svg: playerSvg({ pose: "fall", legA: 0, legB: 0 }),
  },
  {
    name: "player_kick_24x32",
    w: 24,
    h: 32,
    svg: playerSvg({ pose: "kick", legA: 0, legB: -1, scarf: "forward" }),
  },
  {
    name: "height_arrow_16",
    w: 16,
    h: 16,
    svg: `
      <path d="M7 4h2v9H7zM4 7h8v2H4zM5 5h6v2H5zM6 3h4v2H6z" fill="#40c8d0"/>
      <path d="M6 13h4v1H6z" fill="#a0f0ff"/>
    `,
  },
];

function wrap(asset) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${asset.w}" height="${asset.h}" viewBox="0 0 ${asset.w} ${asset.h}" shape-rendering="crispEdges">${asset.svg}</svg>\n`;
}

const manifest = {};
const atlas = {
  meta: {
    imageMode: "loose_png",
    scaleMode: "nearest",
    generatedBy: "tools/generate-assets.mjs",
  },
  frames: {},
};

function frameTags(name) {
  if (name.startsWith("player_")) return ["player"];
  if (name.startsWith("coin")) return ["collectible", "coin"];
  if (name.includes("portal")) return ["portal"];
  if (name.includes("hazard") || name.includes("spikes")) return ["hazard"];
  if (name.includes("hud") || name.includes("arrow") || name.includes("crown")) return ["ui"];
  if (name.includes("cloud") || name.includes("island")) return ["background"];
  return ["environment"];
}

function pivotFor(asset) {
  if (asset.name.startsWith("player_")) return { x: 12, y: 30 };
  if (asset.name.startsWith("coin")) return { x: asset.w / 2, y: asset.h / 2 };
  if (asset.name.includes("portal")) return { x: asset.w / 2, y: asset.h };
  if (asset.name.includes("tree")) return { x: asset.w / 2, y: asset.h };
  return { x: 0, y: 0 };
}

function durationFor(name) {
  if (name.includes("_run_")) return 95;
  if (name.startsWith("coin_spin")) return 200;
  if (name.includes("idle")) return 180;
  return 120;
}

for (const asset of assets) {
  const svgPath = join(outDir, `${asset.name}.svg`);
  const pngPath = join(outDir, `${asset.name}.png`);
  writeFileSync(svgPath, wrap(asset));
  execFileSync("rsvg-convert", ["--keep-aspect-ratio", "-w", String(asset.w), "-h", String(asset.h), "-o", pngPath, svgPath]);
  manifest[asset.name] = {
    svg: `/assets/pixel/${asset.name}.svg`,
    png: `/assets/pixel/${asset.name}.png`,
    width: asset.w,
    height: asset.h,
  };
  atlas.frames[asset.name] = {
    frame: { x: 0, y: 0, w: asset.w, h: asset.h },
    sourceSize: { w: asset.w, h: asset.h },
    spriteSourceSize: { x: 0, y: 0, w: asset.w, h: asset.h },
    pivot: pivotFor(asset),
    tags: frameTags(asset.name),
    durationMs: durationFor(asset.name),
    image: `/assets/pixel/${asset.name}.png`,
  };
}

writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(outDir, "sprite_atlas.json"), `${JSON.stringify(atlas, null, 2)}\n`);
console.log(`Generated ${assets.length} SVG/PNG asset pairs in ${outDir}`);
