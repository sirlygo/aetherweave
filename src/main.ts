import "./style.css";
import cardsJson from "../data/cards.json";
import sealsJson from "../data/seals.json";
import captureJson from "../data/capture.json";
import encJson from "../data/encounters.json";
import { newDuel, apply, throwSeal, aiTurn, type GameData, type DuelState, type CardDef, type Creature } from "./engine/battle.ts";
import { load, store, type Save } from "./save.ts";
import { renderDeck } from "./ui/deck.ts";
import { playReveal } from "./ui/reveal.ts";
import { captureChance, type Seal, type CaptureConfig, type Rarity } from "./engine/capture.ts";

const data: GameData = { cards: cardsJson.cards as CardDef[], elementCycle: cardsJson.elementCycle as GameData["elementCycle"] };
const cfg = captureJson as unknown as CaptureConfig;
const seals = sealsJson.seals as unknown as Seal[];
const enc = encJson.encounters[0];
const HOUR = 18; // in-game dusk for the slice
const el$ = document.getElementById("app")!;
const cardOf = (id: string) => data.cards.find((c) => c.id === id)!;
const ICON: Record<string, string> = { fire: "🔥", water: "💧", storm: "⚡", nature: "🌿" };

// Phase 1 inventory (hard-coded starter bag)
const save: Save = load(cardsJson.starterDeck);
const bag = save.bag;
let duel: DuelState;
let sel: number | null = null;       // selected hand index
let swapFirst: number | null = null; // first lane of a Gust swap
let showBag = false;
let busy = false;
let msg = "";
let result: "won" | "lost" | "captured" | null = null;
let shakeKey = 0;
let revealing = false;
let resultCaptured = false;

function start() {
  duel = newDuel(data, save.deck, enc.deck, { enemyHp: enc.hp, seed: (Date.now() & 0xffff) || 1 });
  sel = null; swapFirst = null; showBag = false; busy = false; msg = ""; result = null; revealing = false; resultCaptured = false;
  render();
}

const chanceFor = (s: Seal) => captureChance({
  seal: s, monsterElement: enc.element as never, monsterRarity: enc.rarity as Rarity,
  hpFraction: Math.max(0, duel.sides.enemy.hp) / enc.hp, hourOfDay: HOUR, statusBroken: false,
  failedThrows: duel.failedThrows, elementCycle: data.elementCycle,
}, cfg);

function laneHtml(c: Creature | null, side: "player" | "enemy", i: number): string {
  const hot = side === "player" ? needLane(i) : needEnemy(i);
  const inner = c
    ? `<div class="card el-${c.element} ${c.sick ? "sick" : ""} ${c.shieldUp ? "shield" : ""}"><div class="nm">${ICON[c.element]} ${c.name}</div><div class="kw">${c.keywords.join(" · ")}</div><div class="st"><span>⚔${c.atk}</span><span>♥${c.hp}</span></div></div>`
    : "";
  return `<div class="lane ${hot ? "hot" : ""}" data-side="${side}" data-lane="${i}">${inner}</div>`;
}
function selDef(): CardDef | null { return sel === null ? null : cardOf(duel.sides.player.hand[sel]); }
function needLane(i: number) {
  const d = selDef(); if (!d) return false;
  if (d.type === "creature") return !duel.sides.player.lanes[i];
  if (d.effect?.kind === "heal_creature") return !!duel.sides.player.lanes[i];
  if (d.effect?.kind === "swap_lanes") return swapFirst === null ? !!duel.sides.player.lanes[i] : i !== swapFirst;
  return false;
}
function needEnemy(i: number) {
  const d = selDef(); return !!d && d.effect?.kind === "damage_creature" && !!duel.sides.enemy.lanes[i];
}

function render() {
  if (result === "captured") { if (!revealing) { revealing = true; playReveal(el$, enc.name, ICON[enc.element], enc.rarity as Rarity, () => { revealing = false; result = "won"; resultCaptured = true; save.collection[enc.monster] = (save.collection[enc.monster] || 0) + 1; store(save); render(); }); } return; }
  const p = duel.sides.player, e = duel.sides.enemy;
  const myTurn = duel.active === "player" && !duel.winner && !busy;
  el$.innerHTML = `
    <div class="bar"><span>${ICON[enc.element]} ${enc.name}</span><span class="hp">♥ ${Math.max(0, e.hp)}/${enc.hp}</span></div>
    <div class="board">
      <div class="row">${e.lanes.map((c, i) => laneHtml(c, "enemy", i)).join("")}</div>
      <div class="div"></div>
      <div class="row">${p.lanes.map((c, i) => laneHtml(c, "player", i)).join("")}</div>
    </div>
    <div class="log">${msg || duel.log[duel.log.length - 1] || ""}</div>
    <div class="bar"><span class="hp">♥ ${Math.max(0, p.hp)}/20</span><span class="en">⚡ ${p.energy}/${p.maxEnergy}</span><span>Deck ${p.deck.length}</span></div>
    <div class="hand">${p.hand.map((id, i) => {
      const d = cardOf(id);
      const stat = d.type === "creature" ? `<span>⚔${d.atk}</span><span>♥${d.hp}</span>` : `<span>${d.name}</span>`;
      return `<div class="card el-${d.element} ${sel === i ? "sel" : ""} ${d.cost > p.energy || !myTurn ? "no" : ""}" data-hand="${i}"><span class="cost">${d.cost}</span><div class="nm">${ICON[d.element]} ${d.type === "creature" ? d.name : "Spell"}</div><div class="kw">${(d.keywords || []).join(" · ") || (d.type === "action" ? d.effect?.kind.replace("_", " ") : "")}</div><div class="st">${stat}</div></div>`;
    }).join("")}</div>
    <div class="btns"><button class="alt" id="bag" ${myTurn ? "" : "disabled"}>🎒 Items</button><button id="end" ${myTurn ? "" : "disabled"}>End turn</button></div>
    ${showBag ? bagHtml() : ""}${result ? resultHtml() : ""}`;
  wire();
}

function bagHtml() {
  const p = duel.sides.player;
  const can = !duel.itemUsed && p.energy >= 1;
  const rows = seals.filter((s) => (bag[s.id] || 0) > 0).map((s) => {
    const pc = Math.round(chanceFor(s) * 100);
    return `<button class="item" data-seal="${s.id}" ${can ? "" : "disabled"}><span>${s.name} ×${bag[s.id]}<small>${s.element ? ICON[s.element] + " " + s.element : "any element"}${s.window ? " · " + s.window.start + "–" + s.window.end + "h" : ""}</small></span><span class="pct">${pc}%</span></button>`;
  }).join("");
  return `<div class="over"><h2>Items</h2><div class="sub">${can ? "Throw a seal (1 energy, once per turn)" : duel.itemUsed ? "Already used an item this turn" : "Need 1 energy"}</div><div class="items">${rows}</div><div class="btns"><button class="alt" id="closebag">Back</button></div></div>`;
}
function resultHtml() {
  const t = resultCaptured ? `<div class="big spark">✨ ${enc.name} captured! ✨</div><div class="sub">Card added to your collection</div>`
    : result === "won" ? `<div class="big spark">Victory</div><div class="sub">${enc.name} fled</div>`
    : `<div class="big">Defeated</div><div class="sub">Try again</div>`;
  return `<div class="over"><div class="center">${t}<div class="btns"><button id="again">Duel again</button></div></div></div>`;
}

function finishCheck() {
  if (duel.winner === "captured") result = "captured";
  else if (duel.winner === "player") result = "won";
  else if (duel.winner === "enemy") result = "lost";
}
function guard(fn: () => void) { try { fn(); } catch (err) { msg = (err as Error).message; shakeKey++; } sel = sel !== null && duel.sides.player.hand[sel] ? sel : null; render(); }

async function endTurn() {
  busy = true; sel = null; swapFirst = null;
  duel = apply(data, duel, { kind: "end_turn" }); finishCheck(); render();
  if (duel.winner) { busy = false; return render(); }
  msg = enc.name + " is moving…"; render();
  await new Promise((r) => setTimeout(r, 700));
  duel = aiTurn(data, duel); msg = ""; busy = false; finishCheck(); render();
}

function wire() {
  el$.querySelectorAll<HTMLElement>("[data-hand]").forEach((n) => n.onclick = () => {
    if (duel.active !== "player" || busy) return;
    const i = +n.dataset.hand!; sel = sel === i ? null : i; swapFirst = null; msg = ""; render();
  });
  el$.querySelectorAll<HTMLElement>(".lane").forEach((n) => n.onclick = () => {
    const d = selDef(); if (!d || sel === null) return;
    const lane = +n.dataset.lane!, side = n.dataset.side;
    guard(() => {
      if (d.type === "creature" && side === "player") { duel = apply(data, duel, { kind: "play_creature", handIndex: sel!, lane }); sel = null; }
      else if (d.effect?.kind === "damage_creature" && side === "enemy") { duel = apply(data, duel, { kind: "play_action", handIndex: sel!, targetLane: lane }); sel = null; }
      else if (d.effect?.kind === "heal_creature" && side === "player") { duel = apply(data, duel, { kind: "play_action", handIndex: sel!, targetLane: lane }); sel = null; }
      else if (d.effect?.kind === "swap_lanes" && side === "player") {
        if (swapFirst === null) { swapFirst = lane; } else { duel = apply(data, duel, { kind: "play_action", handIndex: sel!, swap: [swapFirst, lane] }); sel = null; swapFirst = null; }
      }
      finishCheck();
    });
  });
  document.getElementById("end")?.addEventListener("click", endTurn);
  document.getElementById("bag")?.addEventListener("click", () => { showBag = true; render(); });
  document.getElementById("closebag")?.addEventListener("click", () => { showBag = false; render(); });
  document.getElementById("again")?.addEventListener("click", home);
  el$.querySelectorAll<HTMLElement>("[data-seal]").forEach((n) => n.onclick = () => {
    const s = seals.find((x) => x.id === n.dataset.seal)!;
    const chance = chanceFor(s);
    const r = throwSeal(duel, chance);
    bag[s.id]--; store(save); duel = r.state; showBag = false;
    msg = r.success ? "" : "The seal broke! Failed throws: " + duel.failedThrows;
    finishCheck(); render();
  });
}

function home() {
  result = null; revealing = false;
  const ready = save.deck.length >= 8;
  el$.innerHTML = `<div class="home"><h1>Aetherweave</h1><div class="sub">Ashlands · Dusk</div><button id="go" ${ready ? "" : "disabled"}>${ICON[enc.element]} Hunt ${enc.name}</button><button class="alt" id="coll">🃏 Collection &amp; Deck</button></div>`;
  document.getElementById("go")!.onclick = start;
  document.getElementById("coll")!.onclick = () => renderDeck(el$, data.cards, save, home, () => store(save));
}
home();
