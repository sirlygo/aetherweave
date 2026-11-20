import "./style.css";
import cardsJson from "../data/cards.json";
import sealsJson from "../data/seals.json";
import captureJson from "../data/capture.json";
import encJson from "../data/encounters.json";
import { newDuel, apply, throwSeal, aiTurn, type GameData, type DuelState, type CardDef, type Creature } from "./engine/battle.ts";
import { bonusMap, copiesToRank, MAX_RANK } from "./ranks.ts";
import { load, store, type Save } from "./save.ts";
import { renderDeck } from "./ui/deck.ts";
import { monsterSvg, rivalSvg, ashlandsScene } from "./ui/art.ts";
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
  duel = newDuel(data, isTutorial ? cardsJson.starterDeck : save.deck, e.deck, { enemyHp: e.hp, seed: (Date.now() & 0xffff) || 1, bonus: isTutorial ? {} : bonusMap(save.ranks) });
  sel = null; swapFirst = null; showBag = false; busy = false; atk = null; msg = isTutorial ? "Summon a monster, tap it to attack, then End turn." : ""; result = null; revealing = false; resultCaptured = false;
  render();
}

const chanceFor = (s: Seal) => captureChance({
  seal: s, monsterElement: enc.element as never, monsterRarity: enc.rarity as Rarity,
  hpFraction: Math.max(0, duel.sides.enemy.hp) / enc.hp, hourOfDay: save.hour, statusBroken: false,
  failedThrows: duel.failedThrows, elementCycle: data.elementCycle,
}, cfg);

const SLOTS = 3;
let atk: number | null = null; // selected attacking monster (own field index)
const needsTribute = (d: CardDef) => d.type === "creature" && d.cost >= 3;
function selDef(): CardDef | null { return sel === null ? null : cardOf(duel.sides.player.hand[sel]); }
const foeEmpty = () => duel.sides.enemy.field.every((c) => !c);
function ownHot(i: number): boolean {
  const c = duel.sides.player.field[i], d = selDef();
  if (d) {
    if (d.type === "creature") return needsTribute(d) ? !!c : !c;
    return d.effect?.kind === "heal_creature" && !!c;
  }
  return false;
}
function foeHot(i: number): boolean {
  const c = duel.sides.enemy.field[i], d = selDef();
  if (d && d.type === "action") return (d.effect?.kind === "damage_creature" || d.effect?.kind === "bounce") && !!c;
  return atk !== null && !!c;
}
function zoneHtml(c: Creature | null, side: "player" | "enemy", i: number): string {
  const hot = side === "player" ? ownHot(i) : foeHot(i);
  const ready = side === "player" && c && !c.sick && !c.attacked && duel.active === "player";
  const inner = c
    ? `<div class="card el-${c.element} ${c.sick ? "sick" : ""} ${c.shieldUp ? "shield" : ""} ${ready ? "ready" : ""} ${atk === i && side === "player" ? "sel" : ""} ${c.burning ? "burn" : ""}"><div class="nm">${c.name}</div><div class="art">${monsterSvg(c.cardId, c.element)}</div><div class="kw">${c.keywords.join(" · ")}</div><div class="st"><span>⚔${c.atk}</span><span>♥${c.hp}</span></div></div>`
    : "";
  return `<div class="lane ${hot ? "hot" : ""}" data-side="${side}" data-lane="${i}">${inner}</div>`;
}

function render() {
  const p = duel.sides.player, e = duel.sides.enemy;
  const myTurn = duel.active === "player" && !duel.winner && !busy;
  const direct = atk !== null && foeEmpty();
  el$.innerHTML = `
    ${ashlandsScene(save.hour, `<div class="plate"><div>${enc.name}${tutorial ? " · tutorial" : ""} <span class="hp" style="float:right;margin-left:12px">${Math.max(0, e.hp)}/${enc.hp}</span></div><div class="hpb"><b style="width:${Math.max(0, e.hp) / enc.hp * 100}%;${e.hp / enc.hp < 0.35 ? "background:#ff6a5a" : ""}"></b></div></div><div class="foe ${direct ? "hotfoe" : ""}" id="foe">${enc.monster ? monsterSvg(enc.monster, enc.element, enc.rarity, 110) : rivalSvg(110)}</div>${direct ? '<div class="tip">Tap to strike directly</div>' : ""}`, "battle")}
    <div class="board">
      <div class="row">${e.field.map((c, i) => zoneHtml(c, "enemy", i)).join("")}</div>
      <div class="div"></div>
      <div class="row">${p.field.map((c, i) => zoneHtml(c, "player", i)).join("")}</div>
    </div>
    <div class="log">${msg || duel.log[duel.log.length - 1] || ""}</div>
    <div class="bar"><span class="hp">♥ ${Math.max(0, p.hp)}/20</span><span class="en">${p.summoned ? "Summon ✔" : "Summon ○"} · ${p.spelled ? "Spell ✔" : "Spell ○"}</span><span>Deck ${p.deck.length}</span></div>
    <div class="hand">${p.hand.map((id, i) => {
      const d = cardOf(id);
      const blocked = !myTurn || (d.type === "creature" ? p.summoned : p.spelled);
      const stat = d.type === "creature" ? `<span>⚔${d.atk}</span><span>♥${d.hp}</span>` : `<span>${d.name}</span>`;
      const sub = d.type === "creature" ? ((d.keywords || []).join(" · ") || "") + (needsTribute(d) ? " 🔻tribute" : "") : (d.effect?.kind === "bounce" ? "return to hand" : d.effect?.kind.replace("_", " "));
      return `<div class="card el-${d.element} ${sel === i ? "sel" : ""} ${blocked ? "no" : ""}" data-hand="${i}">${d.type === "creature" ? `<span class="cost">${d.cost}</span>` : ""}<div class="nm">${d.type === "creature" ? d.name : ICON[d.element] + " Spell"}</div>${d.type === "creature" ? `<div class="art">${monsterSvg(d.id, d.element)}</div>` : ""}<div class="kw">${sub}</div><div class="st">${stat}</div></div>`;
    }).join("")}</div>
    <div class="btns"><button class="alt" id="bag" ${myTurn && !tutorial && !duel.itemUsed ? "" : "disabled"}>🎒 Items</button><button id="end" ${myTurn ? "" : "disabled"}>End turn</button></div>
    ${showBag ? bagHtml() : ""}${result ? resultHtml() : ""}`;
  wire();
}

function bagHtml() {
  const can = !duel.itemUsed;
  const rows = seals.filter((s) => (bag[s.id] || 0) > 0).map((s) => {
    const pc = Math.round(chanceFor(s) * 100);
    return `<button class="item" data-seal="${s.id}" ${can ? "" : "disabled"}><span>${s.name} ×${bag[s.id]}<small>${s.element ? ICON[s.element] + " " + s.element : "any element"}${s.window ? " · " + s.window.start + "–" + s.window.end + "h" : ""}</small></span><span class="pct">${pc}%</span></button>`;
  }).join("");
  return `<div class="over"><h2>Items</h2><div class="sub">${can ? "Throw a seal (one item per turn)" : "Already used an item this turn"}</div><div class="items">${rows}</div><div class="btns"><button class="alt" id="closebag">Back</button></div></div>`;
}
function resultHtml() {
  const rew = tutorial ? "" : resultCaptured ? "+40 credits" : result === "won" ? "+25 credits" : "";
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
function guard(fn: () => void) { try { fn(); } catch (err) { msg = (err as Error).message; } finishCheck(); render(); }

async function endTurn() {
  busy = true; sel = null; atk = null;
  duel = apply(data, duel, { kind: "end_turn" }); finishCheck(); render();
  if (duel.winner) { busy = false; return render(); }
  msg = enc.name + " is moving…"; render();
  await new Promise((r) => setTimeout(r, 800));
  duel = aiTurn(data, duel); msg = ""; busy = false; finishCheck(); render();
}

function wire() {
  el$.querySelectorAll<HTMLElement>("[data-hand]").forEach((n) => n.onclick = () => {
    if (duel.active !== "player" || busy) return;
    const i = +n.dataset.hand!; sel = sel === i ? null : i; atk = null; msg = ""; render();
  });
  el$.querySelectorAll<HTMLElement>(".lane").forEach((n) => n.onclick = () => {
    if (duel.active !== "player" || busy || duel.winner) return;
    const slot = +n.dataset.lane!, side = n.dataset.side;
    const d = selDef();
    guard(() => {
      if (d && sel !== null) {
        if (d.type === "creature" && side === "player") {
          duel = apply(data, duel, needsTribute(d) ? { kind: "summon", handIndex: sel, slot, tribute: slot } : { kind: "summon", handIndex: sel, slot }); sel = null;
        } else if (d.type === "action" && side === "enemy" && d.effect?.kind !== "heal_creature") { duel = apply(data, duel, { kind: "spell", handIndex: sel, target: slot }); sel = null; }
        else if (d.type === "action" && side === "player" && d.effect?.kind === "heal_creature") { duel = apply(data, duel, { kind: "spell", handIndex: sel, target: slot }); sel = null; }
        return;
      }
      if (side === "player") { const c = duel.sides.player.field[slot]; atk = c && !c.sick && !c.attacked ? (atk === slot ? null : slot) : null; if (c && (c.sick || c.attacked)) msg = c.attacked ? "Already attacked" : "Just arrived"; return; }
      if (atk !== null) { duel = apply(data, duel, { kind: "attack", from: atk, target: slot }); atk = null; }
    });
  });
  document.getElementById("foe")?.addEventListener("click", () => {
    if (atk !== null && foeEmpty() && duel.active === "player" && !busy) guard(() => { duel = apply(data, duel, { kind: "attack", from: atk!, target: "direct" }); atk = null; });
  });
  document.getElementById("end")?.addEventListener("click", endTurn);
  document.getElementById("bag")?.addEventListener("click", () => { showBag = true; render(); });
  document.getElementById("closebag")?.addEventListener("click", () => { showBag = false; render(); });
  document.getElementById("again")?.addEventListener("click", afterDuel);
  el$.querySelectorAll<HTMLElement>("[data-seal]").forEach((n) => n.onclick = () => {
    const s = seals.find((x) => x.id === n.dataset.seal)!;
    const r = throwSeal(duel, chanceFor(s));
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

const SPOTS = [[22, 62], [70, 58], [44, 78], [84, 82], [14, 88], [58, 50], [34, 48]];
function map() {
  result = null; revealing = false; tutorial = false;
  const here = ALL.filter((e) => e.monster && inWin(e.timeWindow, save.hour));
  const ready = save.deck.length >= 8;
  const sprites = here.map((e, i) => { const [x, y] = SPOTS[i % SPOTS.length]; return `<button class="spot" data-enc="${e.id}" ${ready ? "" : "disabled"} style="left:${x}%;top:${y}%;z-index:${y}">${monsterSvg(e.monster!, e.element, e.rarity, 78)}<span>${e.name}${e.rarity !== "common" ? " ★" : ""}</span></button>`; }).join("");
  el$.innerHTML = `<div class="bar"><span>Ashlands</span><span class="en">${PHASE(save.hour)} ${hourLabel(save.hour)}</span><span>◈ ${save.credits}</span></div>
    <div class="world">${ashlandsScene(save.hour, sprites, "")}</div>
    <div class="sub" style="text-align:center">${ready ? "Tap a monster to challenge it" : "Your deck needs 8+ cards"}</div>
    <div class="btns"><button class="alt" id="coll">🃏 Deck</button>${save.stage === "pact" ? '<button class="alt" id="outpost">🏕 Outpost</button><button class="alt" id="exch">♻ Exchange</button>' : ""}</div>`;
  el$.querySelector<HTMLElement>(".world .scene")!.style.height = "100%";
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
const rankOf = (id: string) => save.ranks[id] || 1;
function exchange() {
  const rows = data.cards.map((c) => ({ c, spare: (save.collection[c.id] || 0) - (c.type === "creature" ? 1 : 2) })).filter((x) => x.spare > 0 || (x.c.type === "creature" && save.collection[x.c.id]));
  const html = rows.map(({ c, spare }) => {
    const r = rankOf(c.id), need = copiesToRank(r), creature = c.type === "creature";
    const can = creature && r < MAX_RANK && spare >= need;
    const rankBtn = creature ? (r >= MAX_RANK ? `<small>MAX rank</small>` : `<button class="alt mini2" data-rank="${c.id}" ${can ? "" : "disabled"}>Rank up (${need} spare)</button>`) : "";
    const sell = spare > 0 ? `<button class="alt mini2" data-sell="${c.id}">Sell ◈ ${SELL}</button>` : "";
    return `<div class="item"><span>${ICON[c.element]} ${c.name} ${creature ? "★".repeat(r) : ""}<small>${spare > 0 ? spare + " spare" : "no spares"}${creature ? " · rank " + r + "/" + MAX_RANK : ""}</small></span><span style="display:flex;gap:6px">${rankBtn}${sell}</span></div>`;
  }).join("");
  el$.innerHTML = `<div class="bar"><span>♻ Exchange</span><span>◈ ${save.credits}</span></div><div class="sub" style="text-align:center">Feed spare copies into a monster to rank it up, or sell them.</div><div class="items">${html || '<div class="sub" style="text-align:center">Nothing here yet. Capture duplicates in the Ashlands.</div>'}</div><div class="btns"><button class="alt" id="back">Back</button></div>`;
  el$.querySelectorAll<HTMLElement>("[data-sell]").forEach((n) => n.onclick = () => { save.collection[n.dataset.sell!]--; save.credits += SELL; store(save); exchange(); });
  el$.querySelectorAll<HTMLElement>("[data-rank]").forEach((n) => n.onclick = () => { const id = n.dataset.rank!, r = rankOf(id); save.collection[id] -= copiesToRank(r); save.ranks[id] = r + 1; store(save); exchange(); });
  document.getElementById("back")!.onclick = map;
}

title();
