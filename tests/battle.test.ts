import { readFileSync } from "node:fs";
import { newDuel, apply, spawn, throwSeal, aiTurn, type GameData, type DuelState, type Action } from "../src/engine/battle.ts";

const raw = JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8"));
const encs = JSON.parse(readFileSync(new URL("../data/encounters.json", import.meta.url), "utf8")).encounters;
const wolf = encs.find((e: { id: string }) => e.id === "ember_wolf_wild");
const data: GameData = { cards: raw.cards, elementCycle: raw.elementCycle };
const starter: string[] = raw.starterDeck;

let failed = 0;
const ok = (n: string, c: boolean, x = "") => { if (!c) failed++; console.log((c ? "PASS " : "FAIL ") + n + (c || !x ? "" : "  (" + x + ")")); };
const throws = (n: string, f: () => unknown) => { let t = false; try { f(); } catch { t = true; } ok(n, t); };

function fresh(seed = 7): DuelState {
  const d = newDuel(data, starter, wolf.deck, { enemyHp: 12, seed });
  d.sides.player.hand = []; d.sides.enemy.hand = [];
  d.sides.player.field = [null, null, null]; d.sides.enemy.field = [null, null, null];
  return d;
}
const act = (d: DuelState, a: Action) => apply(data, d, a);

// setup
{
  const d = newDuel(data, starter, wolf.deck, { enemyHp: 12, seed: 3 });
  ok("both sides start with 5 cards", d.sides.player.hand.length === 5 && d.sides.enemy.hand.length === 5);
  ok("wild monster HP is its listed HP", d.sides.enemy.hp === 12);
  ok("seeded duels are identical", JSON.stringify(newDuel(data, starter, wolf.deck, { seed: 99 })) === JSON.stringify(newDuel(data, starter, wolf.deck, { seed: 99 })));
}

// summon
{
  let d = fresh(); d.sides.player.hand = ["cinderpup", "ashmoth"];
  d = act(d, { kind: "summon", handIndex: 0, slot: 1 });
  ok("summon puts the monster in any zone", d.sides.player.field[1]?.cardId === "cinderpup" && d.sides.player.hand.length === 1);
  throws("only one summon per turn", () => act(d, { kind: "summon", handIndex: 0, slot: 0 }));
}
throws("cannot summon into an occupied zone", () => { let d = fresh(); d.sides.player.hand = ["cinderpup"]; d = spawn(data, d, "player", 0, "ashmoth"); act(d, { kind: "summon", handIndex: 0, slot: 0 }); });
{
  let d = fresh(); d.sides.player.hand = ["magma_hound"];
  throws("level-3 monster needs a tribute", () => act(d, { kind: "summon", handIndex: 0, slot: 0 }));
  d = spawn(data, d, "player", 2, "cinderpup");
  d = act(d, { kind: "summon", handIndex: 0, slot: 2, tribute: 2 });
  ok("tribute is discarded and the big monster lands", d.sides.player.field[2]?.cardId === "magma_hound" && d.sides.player.discard.includes("cinderpup"));
}
{
  let d = fresh(); d.sides.player.hand = ["cinderpup"];
  d = act(d, { kind: "summon", handIndex: 0, slot: 0 });
  ok("Swift monster can attack on arrival", (() => { try { act(d, { kind: "attack", from: 0, target: "direct" }); return true; } catch { return false; } })());
  d = fresh(); d.sides.player.hand = ["ashmoth"]; d = act(d, { kind: "summon", handIndex: 0, slot: 0 });
  throws("summoning sickness blocks attacking", () => act(d, { kind: "attack", from: 0, target: "direct" }));
}

// attacks
{
  let d = fresh(); d = spawn(data, d, "player", 0, "cinderpup");
  d = act(d, { kind: "attack", from: 0, target: "direct" });
  ok("direct attack when the foe has no monsters", d.sides.enemy.hp === 10);
  throws("a monster attacks once per turn", () => act(d, { kind: "attack", from: 0, target: "direct" }));
}
throws("defenders block direct attacks", () => { let d = fresh(); d = spawn(data, d, "player", 0, "cinderpup"); d = spawn(data, d, "enemy", 1, "tidelet"); act(d, { kind: "attack", from: 0, target: "direct" }); });
{
  let d = fresh(); d = spawn(data, d, "player", 0, "ashmoth"); d = spawn(data, d, "enemy", 0, "tidelet"); // 2/2 vs 1/3
  d = act(d, { kind: "attack", from: 0, target: 0 });
  ok("damage is mutual (water counters fire, so the Ashmoth falls)", d.sides.enemy.field[0]?.hp === 1 && d.sides.player.field[0] === null);
}
{
  let d = fresh(); d = spawn(data, d, "player", 0, "gale_hawk"); d = spawn(data, d, "enemy", 0, "tidelet"); // storm beats water: 4 dmg kills 3hp
  d = act(d, { kind: "attack", from: 0, target: 0 });
  ok("element advantage adds 1 and can kill", d.sides.enemy.field[0] === null);
}
{
  let d = fresh(); d = spawn(data, d, "player", 0, "magma_hound"); d = spawn(data, d, "enemy", 1, "cinderpup"); // 4 pierce vs 2/1
  d = act(d, { kind: "attack", from: 0, target: 1 });
  ok("Pierce sends overflow to the player (4 - 1 = 3)", d.sides.enemy.hp === 9, "hp=" + d.sides.enemy.hp);
}
{
  let d = fresh(); d = spawn(data, d, "player", 0, "magma_hound"); d = spawn(data, d, "enemy", 0, "coral_sentinel");
  d = act(d, { kind: "attack", from: 0, target: 0 });
  ok("Shield absorbs the first hit", d.sides.enemy.field[0]?.hp === 5 && d.sides.enemy.field[0]?.shieldUp === false);
}
{
  let d = fresh(); d = spawn(data, d, "player", 0, "ashmoth"); d = spawn(data, d, "enemy", 0, "coral_sentinel"); // shielded, absorbs; burn marks it
  d = act(d, { kind: "attack", from: 0, target: 0 });
  d = act(d, { kind: "end_turn" });
  ok("Burn deals 1 at end of the attacker's turn", d.sides.enemy.field[0]?.hp === 4, "hp=" + d.sides.enemy.field[0]?.hp);
}
{
  let d = fresh(); d = spawn(data, d, "player", 0, "cinderpup"); d = spawn(data, d, "enemy", 0, "tidelet");
  d = act(d, { kind: "attack", from: 0, target: 0 }); d = act(d, { kind: "end_turn" });
  ok("Regen heals 1 at the start of the owner's turn", d.sides.enemy.field[0]?.hp === 2, "hp=" + d.sides.enemy.field[0]?.hp);
}

// spells
{
  let d = fresh(); d.sides.player.hand = ["flare", "flare"]; d = spawn(data, d, "enemy", 2, "cinderpup");
  d = act(d, { kind: "spell", handIndex: 0, target: 2 });
  ok("Flare seals a 1 HP monster and goes to discard", d.sides.enemy.field[2] === null && d.sides.player.discard.includes("flare"));
  throws("one spell per turn", () => act(d, { kind: "spell", handIndex: 0, target: 2 }));
}
{
  let d = fresh(); d.sides.player.hand = ["ripple"]; d = spawn(data, d, "player", 0, "coral_sentinel"); d.sides.player.field[0]!.hp = 1;
  d = act(d, { kind: "spell", handIndex: 0, target: 0 });
  ok("Ripple heals 3", d.sides.player.field[0]?.hp === 4);
}
{
  let d = fresh(); d.sides.player.hand = ["gust"]; d = spawn(data, d, "enemy", 0, "ashmoth");
  d = act(d, { kind: "spell", handIndex: 0, target: 0 });
  ok("Gust bounces a monster back to its owner's hand", d.sides.enemy.field[0] === null && d.sides.enemy.hand.includes("ashmoth"));
}

// turn flow
{
  let d = fresh(); d.sides.player.deck = ["ashmoth"]; d.sides.enemy.deck = ["flare"];
  d = act(d, { kind: "end_turn" });
  ok("end turn passes to the enemy, who draws", d.active === "enemy" && d.sides.enemy.hand.includes("flare"));
  d = act(d, { kind: "end_turn" });
  ok("player draws on turn 2", d.sides.player.hand.includes("ashmoth"));
}
{
  let d = fresh(); d.sides.player.deck = []; d = act(d, { kind: "end_turn" }); d = act(d, { kind: "end_turn" });
  ok("failed draw costs 2 HP", d.sides.player.hp === 18);
}
{
  let d = fresh(); d.sides.player.hand = Array(7).fill("cinderpup"); d.sides.player.deck = ["ashmoth"];
  d = act(d, { kind: "end_turn" }); d = act(d, { kind: "end_turn" });
  ok("hand cap 7: drawn card is discarded", d.sides.player.hand.length === 7 && d.sides.player.discard.includes("ashmoth"));
}

// win and capture
{
  let d = fresh(); d.sides.enemy.hp = 2; d = spawn(data, d, "player", 0, "cinderpup");
  d = act(d, { kind: "attack", from: 0, target: "direct" });
  ok("enemy at 0 HP loses", d.winner === "player");
  throws("no actions after the duel", () => act(d, { kind: "end_turn" }));
}
{
  const d = fresh();
  const hit = throwSeal(d, 1);
  ok("a sure throw captures", hit.success && hit.state.winner === "captured");
  const miss = throwSeal(d, 0);
  ok("a failed throw counts toward pity", !miss.success && miss.state.failedThrows === 1 && miss.state.winner === null);
  throws("one item per turn", () => throwSeal(miss.state, 1));
}

// AI vs AI always finishes, against every encounter
for (const e of encs) {
  let fin = 0, pw = 0; const N = 150;
  for (let g = 0; g < N; g++) {
    let d = newDuel(data, starter, e.deck, { enemyHp: e.hp, seed: g + 1 });
    let k = 0; while (!d.winner && k++ < 300) d = aiTurn(data, d);
    if (d.winner) { fin++; if (d.winner === "player") pw++; }
  }
  ok("AI duels vs " + e.id + " all finish", fin === N, "finished=" + fin);
  console.log("INFO " + e.id + " player win rate " + Math.round((pw / N) * 100) + "%");
}

console.log(failed === 0 ? "\nAll tests passed" : "\n" + failed + " test(s) failed");
process.exit(failed === 0 ? 0 : 1);
