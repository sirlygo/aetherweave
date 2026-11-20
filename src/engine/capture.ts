export type Element = "fire" | "water" | "storm" | "nature";
export type Rarity = "common" | "rare" | "epic" | "boss";

export interface Seal {
  id: string;
  name: string;
  tier: "plain" | "attuned" | "timed" | "conflux" | "mythic";
  baseRate: number;
  element: Element | null;
  window: { start: number; end: number } | null;
}

export interface CaptureConfig {
  cap: number;
  pityAfterFailures: number;
  pityBonus: number;
  hpFactorStops: { hp: number; factor: number }[];
  elementMatch: number;
  elementCounter: number;
  timeInWindow: number;
  statusBonus: number;
  rarity: Record<Rarity, number>;
}

export interface CaptureContext {
  seal: Seal;
  monsterElement: Element;
  monsterRarity: Rarity;
  hpFraction: number; // 0..1
  hourOfDay: number; // 0..24 in-game
  statusBroken: boolean; // shield broken or burning
  failedThrows: number; // failed throws on this monster so far
  elementCycle: Record<Element, Element>; // e.g. fire beats nature
}

export function inWindow(hour: number, w: { start: number; end: number }): boolean {
  return w.start <= w.end ? hour >= w.start && hour < w.end : hour >= w.start || hour < w.end;
}

export function hpFactor(hp: number, stops: { hp: number; factor: number }[]): number {
  const h = Math.min(1, Math.max(0, hp));
  const s = [...stops].sort((a, b) => b.hp - a.hp);
  if (h >= s[0].hp) return s[0].factor;
  if (h <= s[s.length - 1].hp) return s[s.length - 1].factor;
  for (let i = 0; i < s.length - 1; i++) {
    const hi = s[i], lo = s[i + 1];
    if (h <= hi.hp && h >= lo.hp) {
      const t = (hi.hp - h) / (hi.hp - lo.hp);
      return hi.factor + t * (lo.factor - hi.factor);
    }
  }
  return 1;
}

// The counter of an element is the element that beats it.
export function counterOf(el: Element, cycle: Record<Element, Element>): Element {
  return (Object.keys(cycle) as Element[]).find((k) => cycle[k] === el) as Element;
}

export function captureChance(ctx: CaptureContext, cfg: CaptureConfig): number {
  let chance = ctx.seal.baseRate;
  chance *= hpFactor(ctx.hpFraction, cfg.hpFactorStops);
  if (ctx.seal.element) {
    if (ctx.seal.element === ctx.monsterElement) chance *= cfg.elementMatch;
    else if (ctx.seal.element === counterOf(ctx.monsterElement, ctx.elementCycle)) chance *= cfg.elementCounter;
  }
  if (ctx.seal.window && inWindow(ctx.hourOfDay, ctx.seal.window)) chance *= cfg.timeInWindow;
  if (ctx.statusBroken) chance *= cfg.statusBonus;
  chance *= cfg.rarity[ctx.monsterRarity];
  if (ctx.failedThrows >= cfg.pityAfterFailures) chance += cfg.pityBonus;
  return Math.min(cfg.cap, Math.max(0, chance));
}

export function rollCapture(chance: number, rng: () => number): boolean {
  return rng() < chance;
}

// Near-miss rule: on a failure, return which shake (1..3) the seal breaks on.
// Higher chance means a later break.
export function breakShake(chance: number, rng: () => number): 1 | 2 | 3 {
  const w1 = 1 - chance;
  const w2 = 1;
  const w3 = 0.5 + chance * 2;
  const total = w1 + w2 + w3;
  const r = rng() * total;
  if (r < w1) return 1;
  if (r < w1 + w2) return 2;
  return 3;
}
