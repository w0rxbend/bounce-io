import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const outDir = "apps/client/public/assets/pixel";
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(outDir)) {
  if (file.endsWith(".png") || file.endsWith(".svg") || file === "manifest.json" || file === "sprite_atlas.json") {
    rmSync(join(outDir, file));
  }
}

function playerSvg({ pose = "idle", scarf = "back", legA = 0, legB = 0, arm = 0, jacket = "#f3c64b" } = {}) {
  const kick = pose === "kick";
  const jump = pose === "jump";
  const fall = pose === "fall";
  const bodyY = jump ? 9 : fall ? 11 : 10;
  const headY = jump ? 5 : fall ? 7 : 6;
  const eyeY = headY + 3;
  const scarfPaths = scarf === "forward"
    ? `<path d="M16 ${bodyY + 5}h6v2h-6zM19 ${bodyY + 7}h4v2h-4z" fill="#b83020"/><path d="M21 ${bodyY + 9}h2v2h-2z" fill="#701818"/>`
    : `<path d="M3 ${bodyY + 5}h5v2H3zM1 ${bodyY + 7}h5v2H1z" fill="#b83020"/><path d="M1 ${bodyY + 9}h3v2H1z" fill="#701818"/>`;
  const foot = kick ? `<path d="M17 24h6v4h-6zM17 24h6v1h-6z" fill="${jacket}"/>` : "";
  const armPath = kick
    ? `<path d="M16 ${bodyY + 8}h5v3h-5z" fill="#ffd090"/>`
    : `<path d="M${arm < 0 ? 4 : 16} ${bodyY + 8}h4v3h-4z" fill="#ffd090"/>`;
  return `
      <path d="M4 31h16v1H4z" fill="#000000" opacity=".25"/>
      <path d="M7 ${27 + legA}h4v4H7zM14 ${27 + legB}h4v4h-4z" fill="#1a3818"/>
      <path d="M5 ${bodyY}h14v17H5z" fill="#1c1f2a"/>
      <path d="M7 ${bodyY + 2}h10v13H7z" fill="${jacket}"/>
      <path d="M6 ${headY}h12v8H6z" fill="#ffd090"/>
      <path d="M6 ${headY - 1}h12v4H6z" fill="#281a10"/>
      <path d="M15 ${eyeY}h2v2h-2z" fill="#1c1f2a"/>
      <path d="M16 ${eyeY}h1v1h-1z" fill="#ffffff"/>
      ${scarfPaths}
      ${armPath}
      ${foot}
      <path d="M4 ${bodyY}h1v17H4zM19 ${bodyY}h1v17h-1zM5 27h15v1H5z" fill="#1c1f2a"/>
    `;
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
      <path d="M0 3h${w}v13H0z" fill="#28221a"/>
      <path d="M1 4h${w - 2}v11H1z" fill="${runes ? "#786858" : cracked ? "#7f6a50" : "#907858"}"/>
      <path d="M1 4h${w - 2}v2H1z" fill="#7a5030"/>
      <path d="M1 2h${w - 2}v3H1z" fill="#3a7818"/>
      <path d="M1 1h${w - 2}v2H1z" fill="#90d838"/>
      <path d="M3 0h2v2H3zM8 0h1v2H8zM14 0h2v2h-2zM21 0h1v2h-1zM27 0h2v2h-2z${w > 32 ? `M36 0h2v2h-2zM43 0h2v2h-2z` : ""}" fill="#a8e85c"/>
      <path d="M2 9h12v1H2zM17 8h${Math.max(8, w - 19)}v1H17zM8 4h1v5H8zM22 9h1v5h-1z" fill="#28221a" opacity=".45"/>
      <path d="M4 6h5v2H4zM${Math.max(18, w - 12)} 5h4v2h-${4}z" fill="#68c040"/>
      ${cracked ? `<path d="M13 6h1v4h1v3h-1v2h-1v-4h-1V8h1zM${w - 9} 7h1v5h-1z" fill="#28221a" opacity=".65"/>` : ""}
      ${overhang ? `<path d="M2 14h4v3H2zM10 14h3v4h-3zM${w - 8} 14h5v3h-5z" fill="#402818"/><path d="M4 16h1v5H4zM${w - 6} 16h1v4h-1z" fill="#583a20"/>` : ""}
      ${flowers ? `<path d="M6 -2h1v2H6zM7 -3h2v2H7zM${w - 9} -2h1v2h-1zM${w - 8} -3h2v2h-2z" fill="#ffaabb"/><path d="M15 -2h1v2h-1zM16 -3h2v2h-2z" fill="#ffe870"/>` : ""}
      ${roots ? `<path d="M4 15h2v5H4zM7 15h1v3H7zM17 15h2v6h-2zM24 15h1v4h-1zM27 15h2v5h-2z" fill="#402818"/><path d="M5 19h4v1H5zM18 20h5v1h-5zM27 19h3v1h-3z" fill="#583a20"/>` : ""}
      ${runes ? `<path d="M7 8h3v1H7zM8 6h1v5H8zM18 7h5v1h-5zM20 7h1v5h-1zM24 10h2v1h-2z" fill="#30c8c0" opacity=".8"/><path d="M8 7h1v1H8zM20 8h1v1h-1z" fill="#a0f0ff"/>` : ""}
      <path d="M6 14h1v2H6zM15 14h1v2h-1zM${w - 7} 14h1v2h-1z" fill="#583a20"/>
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

const assets = [
  {
    name: "bg_sky_arches_768x432",
    w: 768,
    h: 432,
    svg: `
      <path d="M0 0h768v432H0z" fill="#000000" opacity="0"/>
      <path d="M60 292h98v24H60zM230 268h132v30H230zM478 282h160v28H478z" fill="#304068" opacity=".36"/>
      <path d="M78 270h18v42H78zM125 262h20v50h-20zM258 238h18v58h-18zM320 232h22v66h-22zM516 244h22v63h-22zM590 236h24v70h-24z" fill="#222e48" opacity=".32"/>
      <path d="M65 268h88v6H65zM237 235h116v7H237zM492 241h137v7H492z" fill="#222e48" opacity=".38"/>
      <path d="M88 254h8v14h-8zM132 246h9v16h-9zM264 218h10v17h-10zM328 214h10v18h-10zM525 224h9v17h-9zM598 216h11v20h-11z" fill="#30c8c0" opacity=".18"/>
      <path d="M40 318h160v8H40zM212 298h178v8H212zM450 310h220v9H450z" fill="#489030" opacity=".25"/>
      <path d="M44 314h154v4H44zM216 294h170v4H216zM454 306h212v4H454z" fill="#78d050" opacity=".24"/>
      <path d="M30 326h190v5H30zM206 306h194v5H206zM440 319h242v6H440z" fill="#080e1e" opacity=".18"/>
    `,
  },
  {
    name: "bg_forest_ruins_panorama_1024x576",
    w: 1024,
    h: 576,
    svg: `
      <path d="M0 0h1024v576H0z" fill="#000000" opacity="0"/>
      <path d="M40 96h122v42H40zM240 72h168v48H240zM612 84h176v48H612zM846 118h108v35H846z" fill="#f0e8d8" opacity=".54"/>
      <path d="M58 82h60v28H58zM276 54h80v34h-80zM654 64h88v36h-88zM874 102h48v26h-48z" fill="#fffff0" opacity=".42"/>
      <path d="M70 342h188v30H70zM348 300h236v36H348zM712 328h226v32H712z" fill="#304068" opacity=".34"/>
      <path d="M95 300h26v68H95zM198 284h30v84h-30zM390 246h32v86h-32zM525 232h36v100h-36zM746 266h32v88h-32zM876 250h36v104h-36z" fill="#222e48" opacity=".35"/>
      <path d="M82 292h162v10H82zM368 238h204v12H368zM725 258h202v12H725z" fill="#222e48" opacity=".42"/>
      <path d="M108 274h8v18h-8zM209 264h10v20h-10zM403 220h10v20h-10zM540 214h12v18h-12zM758 244h10v20h-10zM890 228h12v22h-12z" fill="#30c8c0" opacity=".2"/>
      <path d="M54 374h226v12H54zM326 336h282v12H326zM690 360h270v12H690z" fill="#489030" opacity=".28"/>
      <path d="M62 366h210v8H62zM334 328h264v8H334zM700 352h250v8H700z" fill="#78d050" opacity=".34"/>
      <path d="M0 424h150v-36h110v-26h140v44h122v-30h142v42h136v-34h224v192H0z" fill="#1a3818" opacity=".32"/>
      <path d="M0 448h162v-34h118v-24h132v42h122v-28h148v40h120v-32h222v164H0z" fill="#2e6840" opacity=".28"/>
      <path d="M84 408h10v168H84zM262 392h12v184h-12zM458 420h10v156h-10zM742 402h14v174h-14zM934 416h12v160h-12z" fill="#402818" opacity=".35"/>
      <path d="M98 470h62v10H98zM236 502h46v9h-46zM466 478h60v10h-60zM704 514h58v10h-58zM888 490h64v10h-64z" fill="#583a20" opacity=".35"/>
    `,
  },
  {
    name: "bg_ruin_towers_512x256",
    w: 512,
    h: 256,
    svg: `
      <path d="M0 0h512v256H0z" fill="#000000" opacity="0"/>
      <path d="M34 86h38v158H34zM91 122h30v122H91zM170 54h52v190h-52zM250 108h42v136h-42zM354 72h58v172h-58zM436 132h32v112h-32z" fill="#222e48" opacity=".42"/>
      <path d="M28 80h50v10H28zM166 46h60v12h-60zM348 64h70v12h-70z" fill="#222e48" opacity=".5"/>
      <path d="M44 64h18l9 16H35zM188 30h16l20 18h-58zM374 48h14l27 18h-66z" fill="#222e48" opacity=".45"/>
      <path d="M47 116h8v18h-8zM100 154h6v14h-6zM188 92h8v22h-8zM207 128h7v18h-7zM266 146h7v16h-7zM376 111h8v22h-8zM397 154h7v18h-7zM447 164h6v14h-6z" fill="#40d8f8" opacity=".18"/>
      <path d="M0 226h512v30H0z" fill="#1a3818" opacity=".22"/>
      <path d="M0 236h512v20H0z" fill="#080e1e" opacity=".34"/>
      <path d="M20 222h474v6H20z" fill="#2e6840" opacity=".22"/>
      <path d="M28 242h50v14H28zM166 238h60v18h-60zM348 236h70v20h-70z" fill="#080e1e" opacity=".28"/>
    `,
  },
  {
    name: "bg_cloud_bank_768x128",
    w: 768,
    h: 128,
    svg: `
      <path d="M0 0h768v128H0z" fill="#000000" opacity="0"/>
      <path d="M22 76h90V50h54V32h82v23h72v20h98V52h68V36h88v30h78v15h94v34H22z" fill="#8898b8" opacity=".5"/>
      <path d="M10 68h96V42h66V24h82v26h78v18h92V44h78V26h86v28h82v17h84v30H10z" fill="#a8c0d8" opacity=".72"/>
      <path d="M38 58h74V36h58V18h70v24h70v14h78V36h74V18h76v25h72v14h70v24H38z" fill="#f0e8d8" opacity=".78"/>
      <path d="M66 49h42V37h54V28h62v13h58v9h68V41h72V29h54v12h64v9h52v8H66z" fill="#fffff0" opacity=".46"/>
    `,
  },
  {
    name: "bg_canopy_frame_768x160",
    w: 768,
    h: 160,
    svg: `
      <path d="M0 0h768v160H0z" fill="#000000" opacity="0"/>
      <path d="M0 18h72V6h110v20h84V8h132v25h104V12h116v18h150v60H0z" fill="#1a3818" opacity=".78"/>
      <path d="M0 24h92V12h96v22h88V16h126v24h100V22h126v22h140v50H0z" fill="#2e6840" opacity=".74"/>
      <path d="M0 36h86V25h92v20h96V27h116v24h96V34h130v20h152v42H0z" fill="#489030" opacity=".62"/>
      <path d="M46 44h42v8H46zM146 34h56v10h-56zM314 42h72v9h-72zM514 38h58v9h-58zM641 48h66v8h-66z" fill="#78d050" opacity=".55"/>
      <path d="M68 72h8v78h-8zM218 66h10v88h-10zM456 70h8v82h-8zM670 62h11v92h-11z" fill="#402818" opacity=".62"/>
      <path d="M74 96h28v6H74zM198 110h26v6h-26zM462 96h30v6h-30zM642 118h32v6h-32z" fill="#583a20" opacity=".62"/>
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
