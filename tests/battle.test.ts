import { readFileSync } from "node:fs";
import { newDuel, apply, spawn, throwSeal, aiTurn, type GameData, type DuelState } from "../src/engine/battle.ts";

const raw = JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8"));
const enc = JSON.parse(readFileSync(new URL("../data/encounters.json", import.meta.url), "utf8")).encounters[0];
const data: GameData = { cards: raw.cards, elementCycle: raw.elementCycle };
const starter: string[] = raw.starterDeck;

let failed = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  console.log((cond ? "PASS " : "FAIL ") + name + (cond || !extra ? "" : "  (" + extra + ")"));
}
function throws(name: string, fn: () => unknown) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(name, threw);
}

function fresh(seed = 7): DuelState {
  const d = newDuel(data, starter, enc.deck, { enemyHp: 12, seed });
  // Clear hands and boards so each test sets up its own situation.
  d.sides.player.hand = []; d.sides.enemy.hand = [];
  d.sides.player.lanes = [null, null, null]; d.sides.enemy.lanes = [null, null, null];
  return d;
}

// Setup rules
{
  const d = newDuel(data, starter, enc.deck, { enemyHp: 12, seed: 3 });
  ok("player starts with 4 cards (no turn-1 draw)", d.sides.player.hand.length === 4);
  ok("enemy starts with 5 cards", d.sides.enemy.hand.length === 5);
  ok("turn 1 gives 1 energy", d.sides.player.energy === 1 && d.sides.player.maxEnergy === 1);
  ok("wild monster HP is its listed HP", d.sides.enemy.hp === 12);
}

// Same seed, same duel
{
  const a = newDuel(data, starter, enc.deck, { seed: 99 });
  const b = newDuel(data, starter, enc.deck, { seed: 99 });
  ok("seeded duels are identical", JSON.stringify(a) === JSON.stringify(b));
}

// Attacks
{
  let d = fresh();
  d = spawn(data, d, "player", 0, "cinderpup"); // fire 2/1 vs empty lane
  d = apply(data, d, { kind: "end_turn" });
  ok("empty lane hits the player", d.sides.enemy.hp === 10, "hp=" + d.sides.enemy.hp);
}
{
  let d = fresh();
  d = spawn(data, d, "player", 0, "cinderpup");
  d = spawn(data, d, "enemy", 0, "tidelet"); // water 1/3: fire attacking water has no bonus
  d = apply(data, d, { kind: "end_turn" });
  ok("attack into a creature leaves it hurt, no bonus (3 - 2, then Regen +1)", d.sides.enemy.lanes[0]?.hp === 2, "hp=" + d.sides.enemy.lanes[0]?.hp);
  ok("creature hit does not hurt the player", d.sides.enemy.hp === 12);
}
{
  let d = fresh();
  d = spawn(data, d, "player", 1, "gale_hawk"); // storm beats water
  d = spawn(data, d, "enemy", 1, "tidelet");
  d = apply(data, d, { kind: "end_turn" });
  ok("element advantage adds 1 damage (3+1 kills a 3 HP creature)", d.sides.enemy.lanes[1] === null);
}
{
  let d = fresh();
  d.sides.player.hand = ["magma_hound", "cinderpup"];
  d.sides.player.maxEnergy = 3; d.sides.player.energy = 3;
  d = apply(data, d, { kind: "play_creature", handIndex: 0, lane: 0 });
  ok("playing a creature spends its cost", d.sides.player.energy === 0);
  d = apply(data, d, { kind: "end_turn" });
  ok("new creature cannot attack the turn it enters", d.sides.enemy.hp === 12);
}
{
  let d = fresh();
  d.sides.player.hand = ["cinderpup"];
  d = apply(data, d, { kind: "play_creature", handIndex: 0, lane: 0 });
  d = apply(data, d, { kind: "end_turn" });
  ok("Swift creature attacks on entry", d.sides.enemy.hp === 10, "hp=" + d.sides.enemy.hp);
}

// Keywords
{
  let d = fresh();
  d = spawn(data, d, "player", 0, "magma_hound"); // 4 atk, pierce
  d = spawn(data, d, "enemy", 0, "cinderpup"); // 2/1
  d = apply(data, d, { kind: "end_turn" });
  ok("Pierce sends overflow to the player (4 - 1 = 3)", d.sides.enemy.hp === 9, "hp=" + d.sides.enemy.hp);
}
{
  let d = fresh();
  d = spawn(data, d, "player", 0, "magma_hound");
  d = spawn(data, d, "enemy", 0, "coral_sentinel"); // 2/5 with shield
  d = apply(data, d, { kind: "end_turn" });
  ok("Shield ignores the first hit", d.sides.enemy.lanes[0]?.hp === 5);
  ok("Shield is used up", d.sides.enemy.lanes[0]?.shieldUp === false);
}
{
  let d = fresh();
  d = spawn(data, d, "player", 0, "cinderpup");
  d = spawn(data, d, "enemy", 0, "tidelet"); // regen
  d = apply(data, d, { kind: "end_turn" }); // tidelet at 1; enemy turn start regens to 2
  ok("Regen heals 1 at the start of the owner's turn", d.sides.enemy.lanes[0]?.hp === 2, "hp=" + d.sides.enemy.lanes[0]?.hp);
}
{
  let d = fresh();
  d = spawn(data, d, "player", 0, "ashmoth"); // burn, 2/2
  d = spawn(data, d, "enemy", 0, "coral_sentinel"); // shielded: attack eaten by shield, burn lands
  d = apply(data, d, { kind: "end_turn" });
  ok("Burn deals 1 to the enemy in the lane at end of turn", d.sides.enemy.lanes[0]?.hp === 4, "hp=" + d.sides.enemy.lanes[0]?.hp);
}

// Actions
{
  let d = fresh();
  d.sides.player.hand = ["flare"]; d.sides.player.energy = 1;
  d = spawn(data, d, "enemy", 2, "cinderpup");
  d = apply(data, d, { kind: "play_action", handIndex: 0, targetLane: 2 });
  ok("Flare deals 2 and seals a 1 HP creature", d.sides.enemy.lanes[2] === null);
  ok("Used action goes to discard", d.sides.player.discard.includes("flare"));
}
{
  let d = fresh();
  d.sides.player.hand = ["gust"]; d.sides.player.energy = 1;
  d = spawn(data, d, "player", 0, "cinderpup");
  d = apply(data, d, { kind: "play_action", handIndex: 0, swap: [0, 2] });
  ok("Gust swaps lanes", d.sides.player.lanes[2]?.cardId === "cinderpup" && d.sides.player.lanes[0] === null);
}
throws("cannot play without enough energy", () => {
  const d = fresh(); d.sides.player.hand = ["magma_hound"]; d.sides.player.energy = 1;
  apply(data, d, { kind: "play_creature", handIndex: 0, lane: 0 });
});
throws("cannot play into an occupied lane", () => {
  let d = fresh(); d.sides.player.hand = ["cinderpup"]; d.sides.player.energy = 1;
  d = spawn(data, d, "player", 0, "ashmoth");
  apply(data, d, { kind: "play_creature", handIndex: 0, lane: 0 });
});

// Turn flow
{
  let d = fresh();
  d = apply(data, d, { kind: "end_turn" });
  ok("end turn passes to the enemy", d.active === "enemy");
  ok("enemy gets 1 energy on its first turn", d.sides.enemy.energy === 1);
  d = apply(data, d, { kind: "end_turn" });
  ok("player energy grows to 2 on turn 2", d.sides.player.energy === 2);
}
{
  let d = fresh();
  d.sides.player.deck = [];
  d = apply(data, d, { kind: "end_turn" });
  d = apply(data, d, { kind: "end_turn" });
  ok("failed draw costs 2 HP", d.sides.player.hp === 18, "hp=" + d.sides.player.hp);
}
{
  let d = fresh();
  d.sides.player.hand = ["cinderpup", "cinderpup", "cinderpup", "cinderpup", "cinderpup", "cinderpup", "cinderpup"];
  d.sides.player.deck = ["ashmoth"];
  d = apply(data, d, { kind: "end_turn" });
  d = apply(data, d, { kind: "end_turn" });
  ok("hand cap 7: the drawn card is discarded", d.sides.player.hand.length === 7 && d.sides.player.discard.includes("ashmoth"));
}

// Win and capture
{
  let d = fresh();
  d.sides.enemy.hp = 2;
  d = spawn(data, d, "player", 0, "cinderpup");
  d = apply(data, d, { kind: "end_turn" });
  ok("reducing the enemy to 0 wins", d.winner === "player");
  throws("no actions after the duel ends", () => apply(data, d, { kind: "end_turn" }));
}
{
  const d = fresh();
  const hit = throwSeal(d, 1.0);
  ok("a sure throw captures and ends the duel", hit.success && hit.state.winner === "captured");
  ok("throwing spends 1 energy", hit.state.sides.player.energy === d.sides.player.energy - 1);
  const miss = throwSeal(d, 0);
  ok("a failed throw counts toward pity", !miss.success && miss.state.failedThrows === 1 && miss.state.winner === null);
  throws("one item per turn", () => throwSeal(miss.state, 1));
}

// AI plays legal turns and duels always finish
{
  let finished = 0, playerWins = 0, enemyWins = 0, turns = 0, N = 300;
  for (let g = 0; g < N; g++) {
    let d = newDuel(data, starter, enc.deck, { enemyHp: 12, seed: g + 1 });
    let guard = 0;
    while (!d.winner && guard++ < 200) d = aiTurn(data, d);
    if (d.winner) { finished++; turns += d.turn; if (d.winner === "player") playerWins++; else enemyWins++; }
  }
  ok("all " + N + " AI-vs-AI duels finish", finished === N, "finished=" + finished);
  console.log("INFO player wins " + playerWins + ", enemy wins " + enemyWins + ", avg turns " + (turns / N).toFixed(1));
}

console.log(failed === 0 ? "\nAll tests passed" : "\n" + failed + " test(s) failed");
process.exit(failed === 0 ? 0 : 1);
