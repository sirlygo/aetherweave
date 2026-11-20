export type Element = "fire" | "water" | "storm" | "nature";
export type Keyword = "swift" | "shield" | "pierce" | "burn" | "regen" | "thorns" | "last_spark";
export type Side = "player" | "enemy";

export interface CardDef {
  id: string;
  name: string;
  type: "creature" | "action";
  element: Element;
  cost: number;
  rarity: string;
  atk?: number;
  hp?: number;
  keywords?: Keyword[];
  effect?: { kind: "damage_creature" | "heal_creature" | "swap_lanes"; amount?: number };
}

export interface GameData {
  cards: CardDef[];
  elementCycle: Record<Element, Element>; // key beats value
}

export interface Creature {
  uid: number;
  cardId: string;
  name: string;
  element: Element;
  atk: number;
  hp: number;
  maxHp: number;
  keywords: Keyword[];
  shieldUp: boolean;
  sick: boolean;
}

export interface SideState {
  hp: number;
  deck: string[];
  hand: string[];
  discard: string[];
  lanes: (Creature | null)[];
  energy: number;
  maxEnergy: number;
  turnsTaken: number;
}

export interface DuelState {
  turn: number;
  active: Side;
  sides: Record<Side, SideState>;
  rng: number;
  nextUid: number;
  winner: Side | "captured" | null;
  itemUsed: boolean;
  failedThrows: number;
  log: string[];
}

export type Action =
  | { kind: "play_creature"; handIndex: number; lane: number }
  | { kind: "play_action"; handIndex: number; targetLane?: number; swap?: [number, number] }
  | { kind: "end_turn" };

export const LANES = 3;
export const MAX_ENERGY = 6;
export const HAND_CAP = 7;
export const FATIGUE = 2;

const other = (s: Side): Side => (s === "player" ? "enemy" : "player");
const byId = (data: GameData, id: string): CardDef => {
  const c = data.cards.find((x) => x.id === id);
  if (!c) throw new Error("Unknown card: " + id);
  return c;
};

// Mulberry32, state kept in the duel so every duel replays exactly.
function rand(s: DuelState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(s: DuelState, arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newDuel(
  data: GameData,
  playerDeck: string[],
  enemyDeck: string[],
  opts: { enemyHp?: number; playerHp?: number; seed?: number } = {}
): DuelState {
  const s: DuelState = {
    turn: 1,
    active: "player",
    sides: {
      player: blankSide(opts.playerHp ?? 20),
      enemy: blankSide(opts.enemyHp ?? 20),
    },
    rng: opts.seed ?? 1,
    nextUid: 1,
    winner: null,
    itemUsed: false,
    failedThrows: 0,
    log: [],
  };
  s.sides.player.deck = shuffle(s, playerDeck);
  s.sides.enemy.deck = shuffle(s, enemyDeck);
  for (let i = 0; i < 4; i++) draw(s, "player", false);
  for (let i = 0; i < 5; i++) draw(s, "enemy", false); // second player gets 1 extra
  startTurn(data, s, "player");
  return s;
}

function blankSide(hp: number): SideState {
  return { hp, deck: [], hand: [], discard: [], lanes: [null, null, null], energy: 0, maxEnergy: 0, turnsTaken: 0 };
}

function draw(s: DuelState, side: Side, fatigue: boolean): void {
  const sd = s.sides[side];
  if (sd.deck.length === 0) {
    if (fatigue) {
      sd.hp -= FATIGUE;
      s.log.push(side + " has no cards left and loses " + FATIGUE + " HP");
    }
    return;
  }
  const card = sd.deck.shift() as string;
  if (sd.hand.length >= HAND_CAP) sd.discard.push(card);
  else sd.hand.push(card);
}

function startTurn(data: GameData, s: DuelState, side: Side): void {
  const sd = s.sides[side];
  sd.turnsTaken++;
  sd.maxEnergy = Math.min(MAX_ENERGY, sd.turnsTaken);
  sd.energy = sd.maxEnergy;
  for (const c of sd.lanes) {
    if (!c) continue;
    c.sick = false;
    if (c.keywords.includes("regen")) c.hp = Math.min(c.maxHp, c.hp + 1);
  }
  const skipDraw = side === "player" && sd.turnsTaken === 1; // first player skips turn-1 draw
  if (!skipDraw) draw(s, side, true);
  checkWinner(s);
}

function checkWinner(s: DuelState): void {
  if (s.winner) return;
  if (s.sides.player.hp <= 0) s.winner = "enemy";
  else if (s.sides.enemy.hp <= 0) s.winner = "player";
}

// Returns damage that overflowed past the creature's remaining HP.
function dealToCreature(s: DuelState, side: Side, lane: number, dmg: number): number {
  const c = s.sides[side].lanes[lane];
  if (!c || dmg <= 0) return 0;
  if (c.shieldUp) {
    c.shieldUp = false;
    return 0;
  }
  const overflow = Math.max(0, dmg - Math.max(0, c.hp));
  c.hp -= dmg;
  return overflow;
}

function processDeaths(data: GameData, s: DuelState): void {
  let again = true;
  while (again) {
    again = false;
    for (const side of ["player", "enemy"] as Side[]) {
      const sd = s.sides[side];
      for (let i = 0; i < LANES; i++) {
        const c = sd.lanes[i];
        if (c && c.hp <= 0) {
          sd.lanes[i] = null;
          sd.discard.push(c.cardId);
          s.log.push(c.name + " was sealed");
          again = true;
          if (c.keywords.includes("last_spark")) {
            const foe = other(side);
            const targets: number[] = [];
            s.sides[foe].lanes.forEach((x, idx) => { if (x) targets.push(idx); });
            if (targets.length) {
              const pick = targets[Math.floor(rand(s) * targets.length)];
              dealToCreature(s, foe, pick, 1);
            }
          }
        }
      }
    }
  }
}

function makeCreature(s: DuelState, def: CardDef, swiftReady: boolean): Creature {
  const kw = def.keywords ?? [];
  return {
    uid: s.nextUid++,
    cardId: def.id,
    name: def.name,
    element: def.element,
    atk: def.atk ?? 0,
    hp: def.hp ?? 1,
    maxHp: def.hp ?? 1,
    keywords: [...kw],
    shieldUp: kw.includes("shield"),
    sick: swiftReady ? false : !kw.includes("swift"),
  };
}

// Test and setup helper: put a creature straight into a lane, ready to attack.
export function spawn(data: GameData, state: DuelState, side: Side, lane: number, cardId: string): DuelState {
  const s = structuredClone(state);
  s.sides[side].lanes[lane] = makeCreature(s, byId(data, cardId), true);
  return s;
}

export function apply(data: GameData, state: DuelState, action: Action): DuelState {
  if (state.winner) throw new Error("The duel is over");
  const s = structuredClone(state);
  const me = s.active;
  const foe = other(me);
  const sd = s.sides[me];

  if (action.kind === "play_creature") {
    const id = sd.hand[action.handIndex];
    if (!id) throw new Error("No card at that hand index");
    const def = byId(data, id);
    if (def.type !== "creature") throw new Error("That card is not a creature");
    if (def.cost > sd.energy) throw new Error("Not enough energy");
    if (action.lane < 0 || action.lane >= LANES) throw new Error("Bad lane");
    if (sd.lanes[action.lane]) throw new Error("Lane is occupied");
    sd.hand.splice(action.handIndex, 1);
    sd.energy -= def.cost;
    sd.lanes[action.lane] = makeCreature(s, def, false);
    s.log.push(me + " plays " + def.name + " in lane " + action.lane);
    return s;
  }

  if (action.kind === "play_action") {
    const id = sd.hand[action.handIndex];
    if (!id) throw new Error("No card at that hand index");
    const def = byId(data, id);
    if (def.type !== "action" || !def.effect) throw new Error("That card is not an action");
    if (def.cost > sd.energy) throw new Error("Not enough energy");
    const eff = def.effect;
    if (eff.kind === "damage_creature") {
      const t = action.targetLane;
      if (t === undefined || !s.sides[foe].lanes[t]) throw new Error("Needs an enemy creature target");
      dealToCreature(s, foe, t, eff.amount ?? 0);
    } else if (eff.kind === "heal_creature") {
      const t = action.targetLane;
      const c = t === undefined ? null : sd.lanes[t];
      if (!c) throw new Error("Needs one of your creatures as target");
      c.hp = Math.min(c.maxHp, c.hp + (eff.amount ?? 0));
    } else if (eff.kind === "swap_lanes") {
      const sw = action.swap;
      if (!sw || sw[0] === sw[1] || (!sd.lanes[sw[0]] && !sd.lanes[sw[1]])) throw new Error("Needs two lanes with at least one creature");
      [sd.lanes[sw[0]], sd.lanes[sw[1]]] = [sd.lanes[sw[1]], sd.lanes[sw[0]]];
    }
    sd.hand.splice(action.handIndex, 1);
    sd.energy -= def.cost;
    sd.discard.push(id);
    s.log.push(me + " plays " + def.name);
    processDeaths(data, s);
    checkWinner(s);
    return s;
  }

  // end_turn: attack phase, burn, then pass the turn
  const cycle = data.elementCycle;
  const fd = s.sides[foe];
  for (let i = 0; i < LANES; i++) {
    const a = sd.lanes[i];
    if (!a || a.sick) continue;
    const d = fd.lanes[i];
    if (!d) {
      fd.hp -= a.atk;
      s.log.push(a.name + " hits " + foe + " for " + a.atk);
      continue;
    }
    const dmg = a.atk + (cycle[a.element] === d.element ? 1 : 0);
    const overflow = dealToCreature(s, foe, i, dmg);
    if (a.keywords.includes("pierce") && overflow > 0) {
      fd.hp -= overflow;
      s.log.push(a.name + " pierces for " + overflow);
    }
    if (d.keywords.includes("thorns")) dealToCreature(s, me, i, 1);
  }
  processDeaths(data, s);
  for (let i = 0; i < LANES; i++) {
    const a = sd.lanes[i];
    if (a && a.keywords.includes("burn") && fd.lanes[i]) dealToCreature(s, foe, i, 1);
  }
  processDeaths(data, s);
  checkWinner(s);
  if (s.winner) return s;
  s.active = foe;
  s.itemUsed = false;
  s.turn++;
  startTurn(data, s, foe);
  return s;
}

// Capture action: costs 1 energy, one item per turn, player only.
export function throwSeal(state: DuelState, chance: number): { state: DuelState; success: boolean } {
  if (state.winner) throw new Error("The duel is over");
  if (state.active !== "player") throw new Error("Only the player can throw seals");
  const s = structuredClone(state);
  if (s.itemUsed) throw new Error("One item per turn");
  if (s.sides.player.energy < 1) throw new Error("Not enough energy");
  s.sides.player.energy -= 1;
  s.itemUsed = true;
  const success = rand(s) < chance;
  if (success) {
    s.winner = "captured";
    s.log.push("Captured");
  } else {
    s.failedThrows++;
    s.log.push("The seal broke");
  }
  return { state: s, success };
}

// Simple deterministic AI for whichever side is active.
export function aiTurn(data: GameData, state: DuelState): DuelState {
  let s = state;
  let guard = 40;
  while (!s.winner && guard-- > 0) {
    const me = s.active;
    const foe = other(me);
    const sd = s.sides[me];
    const fd = s.sides[foe];
    let next: Action | null = null;

    // 1. Damage spell on the strongest enemy creature
    const enemyLanes = fd.lanes.map((c, i) => (c ? { c, i } : null)).filter(Boolean) as { c: Creature; i: number }[];
    if (enemyLanes.length) {
      const idx = sd.hand.findIndex((id) => {
        const d = byId(data, id);
        return d.type === "action" && d.effect?.kind === "damage_creature" && d.cost <= sd.energy;
      });
      if (idx >= 0) {
        const target = [...enemyLanes].sort((a, b) => b.c.atk - a.c.atk)[0];
        next = { kind: "play_action", handIndex: idx, targetLane: target.i };
      }
    }
    // 2. Heal a damaged creature
    if (!next) {
      const idx = sd.hand.findIndex((id) => {
        const d = byId(data, id);
        return d.type === "action" && d.effect?.kind === "heal_creature" && d.cost <= sd.energy;
      });
      const hurt = sd.lanes.findIndex((c) => c && c.hp < c.maxHp);
      if (idx >= 0 && hurt >= 0) next = { kind: "play_action", handIndex: idx, targetLane: hurt };
    }
    // 3. Highest-cost affordable creature, preferring a lane opposite an empty enemy lane
    if (!next) {
      const empty = sd.lanes.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
      if (empty.length) {
        let best = -1;
        let bestCost = -1;
        sd.hand.forEach((id, i) => {
          const d = byId(data, id);
          if (d.type === "creature" && d.cost <= sd.energy && d.cost > bestCost) { best = i; bestCost = d.cost; }
        });
        if (best >= 0) {
          const open = empty.find((i) => !fd.lanes[i]);
          next = { kind: "play_creature", handIndex: best, lane: open !== undefined ? open : empty[0] };
        }
      }
    }
    if (!next) next = { kind: "end_turn" };
    s = apply(data, s, next);
    if (next.kind === "end_turn") break;
  }
  return s;
}
