// Capture reveal: 3 seal shakes, then a rarity-scaled sparkle burst. No skip; Continue appears at the end.
export type Rarity = "common" | "rare" | "epic" | "boss";
const TIERS: Record<Rarity, { n: number; ms: number; colors: string[]; flash: number; ring: number }> = {
  common: { n: 50, ms: 1800, colors: ["#fff", "#cfc8ff"], flash: 0, ring: 0 },
  rare:   { n: 130, ms: 2600, colors: ["#fff", "#7fd0ff", "#9b7bff"], flash: 0.25, ring: 1 },
  epic:   { n: 260, ms: 3600, colors: ["#fff", "#ffd86b", "#ff9bd5", "#9b7bff"], flash: 0.5, ring: 2 },
  boss:   { n: 460, ms: 4800, colors: ["#fff", "#ffd86b", "#ff7a45", "#ff4fa0", "#7fd0ff"], flash: 0.8, ring: 3 },
};
const LABEL: Record<Rarity, string> = { common: "Common", rare: "Rare", epic: "Epic", boss: "Boss" };

export function playReveal(host: HTMLElement, name: string, icon: string, rarity: Rarity, onDone: () => void) {
  const t = TIERS[rarity];
  host.innerHTML = `<div class="over rv"><canvas></canvas><div class="center rvc"><div class="seal">◈</div><div class="rvn" style="opacity:0"><div style="display:flex;justify-content:center">${icon}</div><div class="big">${name}</div><div class="sub">${LABEL[rarity]} captured</div></div></div></div>`;
  const cv = host.querySelector("canvas")!, ctx = cv.getContext("2d")!;
  const W = (cv.width = host.clientWidth || 390), H = (cv.height = host.clientHeight || 780);
  const seal = host.querySelector<HTMLElement>(".seal")!, nm = host.querySelector<HTMLElement>(".rvn")!;
  const cx = W / 2, cy = H / 2 - 20;
  type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number };
  let parts: P[] = []; let flash = 0; let rings: { r: number; a: number }[] = [];
  const burst = () => {
    for (let i = 0; i < t.n; i++) {
      const a = Math.random() * 6.283, s = 1 + Math.random() * (3 + t.ring * 2.5);
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 50 + Math.random() * (t.ms / 40), c: t.colors[(Math.random() * t.colors.length) | 0], r: 1 + Math.random() * (2 + t.ring) });
    }
    flash = t.flash; for (let i = 0; i < t.ring; i++) rings.push({ r: -i * 18, a: 1 });
    seal.style.opacity = "0"; nm.style.opacity = "1"; nm.classList.add("spark");
  };
  let frame = 0, burstAt = 0, done = false, last = 0;
  const shakes = [0, 600, 1200]; const start = performance.now();
  const loop = (now: number) => {
    const el = now - start;
    shakes.forEach((s) => { if (el >= s && el < s + 350) seal.style.transform = `rotate(${Math.sin((el - s) / 35) * 18}deg)`; });
    if (!burstAt && el > 1900) { burstAt = now; burst(); }
    ctx.clearRect(0, 0, W, H);
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); flash -= 0.02; }
    for (const r of rings) { r.r += 6; r.a -= 0.012; if (r.r > 0 && r.a > 0) { ctx.strokeStyle = `rgba(255,255,255,${r.a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r.r, 0, 6.283); ctx.stroke(); } }
    parts = parts.filter((p) => p.life++ < p.max);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.vx *= 0.99; ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    // epic and boss keep a gentle sparkle rain until the end
    if (burstAt && t.ring >= 2 && now - burstAt < t.ms - 600 && frame++ % 2 === 0) parts.push({ x: Math.random() * W, y: -5, vx: 0, vy: 1 + Math.random() * 2, life: 0, max: 120, c: t.colors[(Math.random() * t.colors.length) | 0], r: 1 + Math.random() * 2 });
    if (burstAt && !done && now - burstAt > t.ms) {
      done = true; host.querySelector(".rvc")!.insertAdjacentHTML("beforeend", `<div class="btns"><button id="rvdone">Continue</button></div>`);
      host.querySelector<HTMLElement>("#rvdone")!.onclick = onDone;
    }
    last = now; if (!done || parts.length) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
