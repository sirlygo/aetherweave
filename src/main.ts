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
type Enc = { id: string; monster: string | null; name: string; element: string; rarity: string; hp: number; deck: string[]; timeWindow?: { start: number; end: number } };
const ALL = encJson.encounters as unknown as Enc[];
let enc: Enc = ALL[0];
let tutorial = false;
let settled = false;
const el$ = document.getElementById("app")!;
const cardOf = (id: string) => data.cards.find((c) => c.id === id)!;
const ICON: Record<string, string> = { fire: "🔥", water: "💧", storm: "⚡", nature: "🌿" };

// Phase 1 inventory (hard-coded starter bag)
const save: Save = load(cardsJson.starterDeck);
const bag = save.bag;
const hourLabel = (h: number) => String(h).padStart(2, "0") + ":00";
const inWin = (w: Enc["timeWindow"], h: number) => !w || (w.start <= w.end ? h >= w.start && h < w.end : h >= w.start || h < w.end);
const PHASE = (h: number) => (h >= 6 && h < 12 ? "🌅 Morning" : h >= 12 && h < 17 ? "☀️ Day" : h >= 17 && h < 20 ? "🌇 Dusk" : "🌙 Night");
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

function startDuel(e: Enc, isTutorial = false) {
  enc = e; tutorial = isTutorial; settled = false;
  duel = newDuel(data, isTutorial ? cardsJson.starterDeck : save.deck, e.deck, { enemyHp: e.hp, seed: (Date.now() & 0xffff) || 1 });
  sel = null; swapFirst = null; showBag = false; busy = false; msg = isTutorial ? "Tutorial: play cards, then End turn. Reduce Kade to 0 HP." : ""; result = null; revealing = false; resultCaptured = false;
  render();
}

const chanceFor = (s: Seal) => captureChance({
  seal: s, monsterElement: enc.element as never, monsterRarity: enc.rarity as Rarity,
  hpFraction: Math.max(0, duel.sides.enemy.hp) / enc.hp, hourOfDay: save.hour, statusBroken: false,
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
  if (result === "captured") { if (!revealing) { revealing = true; playReveal(el$, enc.name, ICON[enc.element], enc.rarity as Rarity, () => { revealing = false; result = "won"; resultCaptured = true; render(); }); } return; }
  const p = duel.sides.player, e = duel.sides.enemy;
  const myTurn = duel.active === "player" && !duel.winner && !busy;
  el$.innerHTML = `
    <div class="bar"><span>${ICON[enc.element]} ${enc.name}${tutorial ? " (tutorial)" : ""}</span><span class="hp">♥ ${Math.max(0, e.hp)}/${enc.hp}</span></div>
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
    <div class="btns"><button class="alt" id="bag" ${myTurn && !tutorial ? "" : "disabled"}>🎒 Items</button><button id="end" ${myTurn ? "" : "disabled"}>End turn</button></div>
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
  const rew = tutorial ? "" : result === "captured" ? "+40 credits" : result === "won" ? "+25 credits" : "";
  const t = resultCaptured ? `<div class="big spark">✨ ${enc.name} captured! ✨</div><div class="sub">Card added to your collection · ${rew}</div>`
    : result === "won" ? `<div class="big spark">Victory</div><div class="sub">${tutorial ? "You beat Kade!" : enc.name + " fled · " + rew}</div>`
    : `<div class="big">Defeated</div><div class="sub">${tutorial ? "Try again" : "You retreat to the portal"}</div>`;
  return `<div class="over"><div class="center">${t}<div class="btns"><button id="again">Continue</button></div></div></div>`;
}
function afterDuel() {
  const was = result; result = null;
  if (tutorial) { if (was === "won") { save.stage = "tutorial_done"; store(save); return story(PORTAL, map); } return startDuel(ALL.find((e) => e.id === "kade_tutorial")!, true); }
  if (resultCaptured && save.stage === "tutorial_done") { save.stage = "pact"; store(save); return story(PACT, map); }
  map();
}

function finishCheck() {
  if (duel.winner === "captured") result = "captured";
  else if (duel.winner === "player") result = "won";
  else if (duel.winner === "enemy") result = "lost";
  if (result && !settled) {
    settled = true;
    if (!tutorial) {
      save.hour = (save.hour + 1) % 24;
      if (result === "captured") { save.collection[enc.monster!] = (save.collection[enc.monster!] || 0) + 1; save.credits += 40; }
      else if (result === "won") save.credits += 25;
    }
    store(save);
  }
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
  document.getElementById("again")?.addEventListener("click", afterDuel);
  el$.querySelectorAll<HTMLElement>("[data-seal]").forEach((n) => n.onclick = () => {
    const s = seals.find((x) => x.id === n.dataset.seal)!;
    const chance = chanceFor(s);
    const r = throwSeal(duel, chance);
    bag[s.id]--; store(save); duel = r.state; showBag = false;
    msg = r.success ? "" : "The seal broke! Failed throws: " + duel.failedThrows;
    finishCheck(); render();
  });
}

const INTRO = [
  "You've loved the Aetherweave card game for years. Every sealed monster on every card feels almost alive.",
  "Tonight, your rival Kade challenges you to a duel in the back of the card shop.",
  "Win it, and maybe you'll finally learn what the old players mean when they say the cards are doors.",
];
const PORTAL = [
  "As your last attack lands, the Cinderpup card in your hand trembles, and a seam of light tears open in the air.",
  "You step through. The Conflux: a shattered world of burning Ashlands where sealed monsters roam free.",
  "Seals can catch them. Find a monster, challenge it, weaken it, and throw the right seal at the right time.",
];
const PACT = [
  "A hooded figure steps out of the ash. \"So. Another one who found the way in.\"",
  "You are not the only human in the Conflux. The League of the Chosen watches this place, bound by a magic Pact: no one may tell or show anyone outside what lies here.",
  "The League runs the Conflux Outpost. Spend your credits there on seals. The Pact took hold the moment you entered.",
];
function story(lines: string[], next: () => void, i = 0) {
  el$.innerHTML = `<div class="home"><div class="big spark" style="font-size:20px;line-height:1.4">${lines[i]}</div><button id="nx">${i < lines.length - 1 ? "Next" : "Continue"}</button></div>`;
  document.getElementById("nx")!.onclick = () => (i < lines.length - 1 ? story(lines, next, i + 1) : next());
}

function title() {
  const fresh = save.stage === "new";
  el$.innerHTML = `<div class="home"><h1>Aetherweave</h1><div class="sub">The Shattered Conflux</div><button id="go">${fresh ? "Begin" : "Continue"}</button></div>`;
  document.getElementById("go")!.onclick = () => (fresh ? story(INTRO, () => startDuel(ALL.find((e) => e.id === "kade_tutorial")!, true)) : map());
}

function map() {
  result = null; revealing = false; tutorial = false;
  const here = ALL.filter((e) => e.monster && inWin(e.timeWindow, save.hour));
  const ready = save.deck.length >= 8;
  el$.innerHTML = `<div class="bar"><span>Ashlands</span><span class="en">${PHASE(save.hour)} ${hourLabel(save.hour)}</span><span>◈ ${save.credits}</span></div>
    <div class="sub" style="text-align:center">${ready ? "Tap a monster to challenge it" : "Your deck needs 8+ cards"}</div>
    <div class="items" style="display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:8px">${here.map((e) => `<button class="item mon" data-enc="${e.id}" ${ready ? "" : "disabled"} style="flex-direction:column;align-items:flex-start;gap:4px"><span style="font-size:30px">${ICON[e.element]}</span><b>${e.name}</b><small>${e.rarity} · ♥${e.hp}${e.timeWindow ? " · " + e.timeWindow.start + "–" + e.timeWindow.end + "h" : ""}</small></button>`).join("")}</div>
    <div class="btns"><button class="alt" id="coll">🃏 Deck</button>${save.stage === "pact" ? '<button class="alt" id="outpost">🏕 Outpost</button><button class="alt" id="exch">♻ Exchange</button>' : ""}</div>`;
  el$.querySelectorAll<HTMLElement>("[data-enc]").forEach((n) => n.onclick = () => startDuel(ALL.find((e) => e.id === n.dataset.enc)!));
  document.getElementById("coll")!.onclick = () => renderDeck(el$, data.cards, save, map, () => store(save));
  document.getElementById("outpost")?.addEventListener("click", outpost);
  document.getElementById("exch")?.addEventListener("click", exchange);
}

function outpost() {
  const stock = seals.filter((s) => (s as unknown as { price?: number }).price && ["plain", "attuned", "timed"].includes(s.tier));
  el$.innerHTML = `<div class="bar"><span>🏕 Conflux Outpost</span><span>◈ ${save.credits}</span></div><div class="items">${stock.map((s) => { const price = (s as unknown as { price: number }).price; return `<button class="item" data-buy="${s.id}" ${save.credits >= price ? "" : "disabled"}><span>${s.name} <small>${s.element ? ICON[s.element] + " " + s.element : "any element"}${s.window ? " · " + s.window.start + "–" + s.window.end + "h" : ""} · owned ${bag[s.id] || 0}</small></span><span class="pct">◈ ${price}</span></button>`; }).join("")}</div><div class="btns"><button class="alt" id="back">Back</button></div>`;
  el$.querySelectorAll<HTMLElement>("[data-buy]").forEach((n) => n.onclick = () => { const s = seals.find((x) => x.id === n.dataset.buy)! as unknown as { id: string; price: number }; if (save.credits < s.price) return; save.credits -= s.price; bag[s.id] = (bag[s.id] || 0) + 1; store(save); outpost(); });
  document.getElementById("back")!.onclick = map;
}

const SELL = 20;
function exchange() {
  const extras = data.cards.map((c) => ({ c, n: (save.collection[c.id] || 0) - (c.type === "creature" ? 1 : 2) })).filter((x) => x.n > 0);
  el$.innerHTML = `<div class="bar"><span>♻ Exchange</span><span>◈ ${save.credits}</span></div><div class="sub" style="text-align:center">Sell spare copies. Rank-ups come later.</div><div class="items">${extras.length ? extras.map(({ c, n }) => `<button class="item" data-sell="${c.id}"><span>${ICON[c.element]} ${c.name} <small>${n} spare</small></span><span class="pct">Sell ◈ ${SELL}</span></button>`).join("") : '<div class="sub" style="text-align:center">No spare copies yet. Capture duplicates in the Ashlands.</div>'}</div><div class="btns"><button class="alt" id="back">Back</button></div>`;
  el$.querySelectorAll<HTMLElement>("[data-sell]").forEach((n) => n.onclick = () => { save.collection[n.dataset.sell!]--; save.credits += SELL; store(save); exchange(); });
  document.getElementById("back")!.onclick = map;
}

title();
