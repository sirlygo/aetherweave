import { readFileSync } from "node:fs";
import { captureChance, hpFactor, inWindow, breakShake, type CaptureConfig, type Seal, type Element } from "../src/engine/capture.ts";

const cfg = JSON.parse(readFileSync(new URL("../data/capture.json", import.meta.url), "utf8")) as CaptureConfig;
const cards = JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8"));
const seals = JSON.parse(readFileSync(new URL("../data/seals.json", import.meta.url), "utf8")).seals as Seal[];
const cycle = cards.elementCycle as Record<Element, Element>;
const seal = (id: string) => seals.find((s) => s.id === id)!;

let failed = 0;
function eq(name: string, got: number, want: number, tol = 0.005) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + name + " got=" + got.toFixed(4) + " want=" + want.toFixed(4));
}
function ok(name: string, cond: boolean) {
  if (!cond) failed++;
  console.log((cond ? "PASS " : "FAIL ") + name);
}

const base = { monsterElement: "fire" as Element, monsterRarity: "rare" as const, hpFraction: 0.2, hourOfDay: 18, statusBroken: false, failedThrows: 0, elementCycle: cycle };

// Doc example: Dusk Seal on a Rare monster at 20% HP at dusk = 15% x 2.0 x 1.5 x 0.8 = 36%
eq("dusk example", captureChance({ ...base, seal: seal("dusk") }, cfg), 0.36);
eq("hp factor 100%", hpFactor(1, cfg.hpFactorStops), 1.0);
eq("hp factor 50%", hpFactor(0.5, cfg.hpFactorStops), 1.5);
eq("hp factor 20%", hpFactor(0.2, cfg.hpFactorStops), 2.0);
eq("hp factor 5%", hpFactor(0.05, cfg.hpFactorStops), 2.5);
eq("hp factor 35%", hpFactor(0.35, cfg.hpFactorStops), 1.75);

// Matching Attuned seal gets x1.5, counter seal x0.7
const emberVsFire = captureChance({ ...base, seal: seal("ember"), hourOfDay: 12 }, cfg);
const tideVsFire = captureChance({ ...base, seal: seal("tide"), hourOfDay: 12 }, cfg);
const graveVsFire = captureChance({ ...base, seal: seal("gale"), hourOfDay: 12 }, cfg);
eq("ember vs fire", emberVsFire, 0.12 * 2.0 * 1.5 * 0.8);
eq("tide vs fire (counter)", tideVsFire, 0.12 * 2.0 * 0.7 * 0.8);
eq("gale vs fire (neutral)", graveVsFire, 0.12 * 2.0 * 0.8);

// Timed seal outside its window gets no bonus
eq("dusk seal at noon", captureChance({ ...base, seal: seal("dusk"), hourOfDay: 12 }, cfg), 0.15 * 2.0 * 0.8);

// Midnight window wraps past 24
ok("midnight at 23", inWindow(23, seal("midnight").window!));
ok("midnight at 1", inWindow(1, seal("midnight").window!));
ok("midnight at 3 is outside", !inWindow(3, seal("midnight").window!));

// Pity: +10 percentage points after 3 failures
const noPity = captureChance({ ...base, seal: seal("plain") }, cfg);
const pity = captureChance({ ...base, seal: seal("plain"), failedThrows: 3 }, cfg);
eq("pity bonus", pity - noPity, 0.10);

// Cap
eq("cap 85%", captureChance({ ...base, seal: seal("astral"), monsterRarity: "common", hpFraction: 0.05, statusBroken: true }, cfg), 0.85);

// Boss-class is hard even with a good seal
const boss = captureChance({ ...base, seal: seal("ember"), monsterRarity: "boss", hourOfDay: 12 }, cfg);
ok("boss capture stays under 20% with matching seal at 20% HP", boss < 0.2);

// Break shake always returns 1..3 and skews later at high chance
let late = 0, earlyHigh = 0;
let seed = 1;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let i = 0; i < 5000; i++) { if (breakShake(0.8, rng) === 3) late++; if (breakShake(0.1, rng) === 3) earlyHigh++; }
ok("high chance breaks late more often than low chance", late > earlyHigh);

console.log(failed === 0 ? "\nAll tests passed" : "\n" + failed + " test(s) failed");
process.exit(failed === 0 ? 0 : 1);
