// Procedural monster art + biome scenes. Placeholder until real art exists: one silhouette per species, tinted by element.
type P = { b: string; d: string; l: string };
const PAL: Record<string, P> = {
  fire: { b: "#ff7a45", d: "#b8391a", l: "#ffd08a" },
  water: { b: "#4aa8ff", d: "#1f5fb0", l: "#b5e4ff" },
  storm: { b: "#f5d142", d: "#a8841a", l: "#fff6b0" },
  nature: { b: "#5fd07a", d: "#2a7d42", l: "#cdf7d3" },
};
const SHAPE: Record<string, string> = { cinderpup: "quad", magma_hound: "hound", ember_wolf: "wolf", ashmoth: "moth", tidelet: "blob", coral_sentinel: "armor", gale_hawk: "bird" };
const eye = (x: number, y: number, r = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x + 0.8}" cy="${y + 0.5}" r="${r * 0.5}" fill="#1a1428"/>`;

function body(shape: string, p: P): string {
  switch (shape) {
    case "quad": case "hound": case "wolf": {
      const big = shape !== "quad", wolf = shape === "wolf";
      const s = big ? 1.12 : 1;
      return `<g transform="translate(50 52) scale(${s}) translate(-50 -52)">
        <path d="M70 64 C96 60 96 34 82 24 C84 40 74 44 66 54Z" fill="${p.l}"/><path d="M72 62 C88 58 88 42 82 34 C80 46 76 50 70 56Z" fill="${p.b}"/>
        <rect x="30" y="70" width="9" height="16" rx="4" fill="${p.d}"/><rect x="46" y="72" width="9" height="14" rx="4" fill="${p.d}"/><rect x="60" y="70" width="9" height="16" rx="4" fill="${p.d}"/>
        <ellipse cx="52" cy="64" rx="27" ry="18" fill="${p.b}"/><ellipse cx="52" cy="70" rx="18" ry="10" fill="${p.l}" opacity=".55"/>
        ${big ? `<path d="M36 50 L42 38 L48 50Z M48 48 L55 34 L61 48Z M60 50 L67 38 L72 52Z" fill="${p.d}"/>` : ""}
        ${wolf ? `<path d="M26 40 C20 28 28 20 30 14 C36 24 40 28 44 34Z M40 34 C38 22 46 14 50 8 C52 20 54 26 56 34Z" fill="${p.l}"/>` : ""}
        <circle cx="32" cy="48" r="17" fill="${p.b}"/><path d="M20 38 L18 22 L30 32Z M38 32 L46 20 L46 38Z" fill="${p.d}"/>
        <ellipse cx="24" cy="54" rx="9" ry="6" fill="${p.l}"/><circle cx="19" cy="52" r="2.2" fill="#1a1428"/>${eye(34, 44)}</g>`;
    }
    case "moth":
      return `<path d="M50 50 C20 14 6 34 12 56 C16 70 38 66 50 56Z" fill="${p.b}"/><path d="M50 50 C80 14 94 34 88 56 C84 70 62 66 50 56Z" fill="${p.b}"/>
        <path d="M50 54 C30 40 18 46 20 56 C24 62 40 60 50 56Z" fill="${p.l}" opacity=".7"/><path d="M50 54 C70 40 82 46 80 56 C76 62 60 60 50 56Z" fill="${p.l}" opacity=".7"/>
        <circle cx="26" cy="42" r="5" fill="${p.d}"/><circle cx="74" cy="42" r="5" fill="${p.d}"/>
        <ellipse cx="50" cy="60" rx="9" ry="20" fill="${p.d}"/><circle cx="50" cy="38" r="10" fill="${p.d}"/>${eye(46, 37, 3.4)}${eye(55, 37, 3.4)}
        <path d="M45 30 C38 18 32 18 30 12 M55 30 C62 18 68 18 70 12" stroke="${p.d}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case "blob":
      return `<path d="M50 18 C72 38 84 52 84 66 C84 82 68 88 50 88 C32 88 16 82 16 66 C16 52 28 38 50 18Z" fill="${p.b}"/>
        <path d="M18 62 C6 56 6 74 16 76Z M82 62 C94 56 94 74 84 76Z" fill="${p.d}"/><path d="M50 18 C50 8 44 6 40 4 C44 12 44 16 50 18Z" fill="${p.l}"/>
        <ellipse cx="50" cy="74" rx="22" ry="10" fill="${p.l}" opacity=".5"/>${eye(38, 56, 6)}${eye(62, 56, 6)}<path d="M44 70 Q50 75 56 70" stroke="${p.d}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    case "armor":
      return `<path d="M10 66 C4 54 14 46 20 52 C22 58 20 64 16 68Z M90 66 C96 54 86 46 80 52 C78 58 80 64 84 68Z" fill="${p.d}"/>
        <path d="M18 76 C18 38 82 38 82 76Z" fill="${p.b}"/><path d="M26 74 C28 48 72 48 74 74Z" fill="${p.l}" opacity=".35"/>
        <path d="M30 52 L26 30 L38 46Z M46 46 L50 22 L56 46Z M62 46 L74 30 L70 52Z" fill="${p.d}"/><path d="M30 52 L26 30 L34 38Z M50 22 L46 34 L53 36Z" fill="${p.l}"/>
        <rect x="14" y="76" width="72" height="9" rx="4" fill="${p.d}"/><circle cx="38" cy="66" r="5" fill="#fff"/><circle cx="62" cy="66" r="5" fill="#fff"/><circle cx="39" cy="67" r="2.4" fill="#1a1428"/><circle cx="63" cy="67" r="2.4" fill="#1a1428"/>`;
    case "bird":
      return `<path d="M44 52 C20 30 6 44 4 60 C18 56 30 62 44 66Z" fill="${p.d}"/><path d="M56 52 C80 30 94 44 96 60 C82 56 70 62 56 66Z" fill="${p.d}"/>
        <path d="M44 56 C28 44 16 50 14 58 C26 56 34 60 44 64Z" fill="${p.b}"/><path d="M56 56 C72 44 84 50 86 58 C74 56 66 60 56 64Z" fill="${p.b}"/>
        <path d="M34 84 L40 66 L50 70 L60 66 L66 84 L50 78Z" fill="${p.d}"/><ellipse cx="50" cy="58" rx="14" ry="20" fill="${p.b}"/><ellipse cx="50" cy="66" rx="9" ry="12" fill="${p.l}"/>
        <circle cx="50" cy="36" r="13" fill="${p.b}"/><path d="M44 26 L50 12 L56 26Z" fill="${p.l}"/><path d="M44 40 L50 52 L56 40Z" fill="#ffb21e"/>${eye(44, 34, 3.6)}${eye(56, 34, 3.6)}`;
  }
  return `<circle cx="50" cy="56" r="28" fill="${p.b}"/>${eye(42, 52, 5)}${eye(58, 52, 5)}`;
}

export function monsterSvg(id: string, element: string, rarity = "common", px = 96): string {
  const p = PAL[element] || PAL.fire;
  const shape = SHAPE[id] || "blob";
  return `<svg class="mon r-${rarity}" width="${px}" height="${px}" viewBox="0 0 100 100" aria-label="${id}"><ellipse cx="50" cy="90" rx="30" ry="5" fill="#000" opacity=".28"/>${body(shape, p)}</svg>`;
}

export function rivalSvg(px = 96): string {
  return `<svg class="mon" width="${px}" height="${px}" viewBox="0 0 100 100"><ellipse cx="50" cy="92" rx="26" ry="5" fill="#000" opacity=".28"/><path d="M30 90 L34 54 C34 46 66 46 66 54 L70 90Z" fill="#7a2230"/><circle cx="50" cy="36" r="13" fill="#f0c7a0"/><path d="M36 34 C36 18 64 18 64 34 C58 28 42 28 36 34Z" fill="#2a1a14"/><circle cx="45" cy="38" r="2" fill="#1a1428"/><circle cx="55" cy="38" r="2" fill="#1a1428"/><rect x="34" y="58" width="32" height="6" fill="#e8c14a"/></svg>`;
}

export function phaseClass(h: number): string {
  return h >= 6 && h < 12 ? "morning" : h >= 12 && h < 17 ? "day" : h >= 17 && h < 20 ? "dusk" : "night";
}

// Ashlands backdrop: sky by time of day, sun or moon, layered volcanic ridges, drifting embers.
export function ashlandsScene(hour: number, inner = "", cls = ""): string {
  const ph = phaseClass(hour);
  const orb = ph === "night" ? `<circle cx="300" cy="46" r="16" fill="#eef0ff" opacity=".9"/><circle cx="306" cy="42" r="14" fill="#0e0b22" opacity=".35"/>` : `<circle cx="${ph === "dusk" ? 80 : 300}" cy="${ph === "dusk" ? 130 : 50}" r="${ph === "dusk" ? 34 : 22}" fill="${ph === "dusk" ? "#ffb347" : "#fff3b0"}" opacity=".95"/>`;
  const embers = Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 73) % 100}%;animation-delay:${(i * 0.7) % 6}s;animation-duration:${5 + (i % 4)}s"></i>`).join("");
  return `<div class="scene ${ph} ${cls}"><svg class="sky" viewBox="0 0 360 300" preserveAspectRatio="xMidYMax slice">${orb}
    <path d="M0 210 L40 150 L70 180 L120 120 L170 175 L220 130 L270 170 L320 125 L360 160 L360 300 L0 300Z" fill="var(--ridge3)"/>
    <path d="M0 240 L50 200 L100 225 L160 180 L230 228 L290 195 L360 230 L360 300 L0 300Z" fill="var(--ridge2)"/>
    <path d="M120 120 L128 134 L112 134Z M320 125 L330 140 L310 140Z" fill="#ff6a2b" opacity=".85"/>
    <path d="M0 268 C60 250 120 280 190 262 C250 248 310 276 360 258 L360 300 L0 300Z" fill="var(--ridge1)"/>
    <path d="M60 280 C100 272 120 290 160 284" stroke="#ff6a2b" stroke-width="2" fill="none" opacity=".7"/></svg><div class="embers">${embers}</div>${inner}</div>`;
}
