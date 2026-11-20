// Classic card duel: 3 monster zones, one summon + one spell per turn, level-3 monsters need a tribute,
// attackers pick a target, damage is mutual, direct attacks only when the foe's field is empty.
export type Element = "fire" | "water" | "storm" | "nature";
export type Keyword = "swift" | "shield" | "pierce" | "burn" | "regen" | "thorns" | "last_spark";
export type Side = "player" | "enemy";

export interface CardDef {
  id: string; name: string; type: "creature" | "action"; element: Element; cost: number; rarity: string;
  atk?: number; hp?: number; keywords?: Keyword[];
  effect?: { kind: "damage_creature" | "heal_creature" | "bounce"; amount?: number };
}
export interface GameData { cards: CardDef[]; elementCycle: Record<Element, Element> }

export interface Creature {
  uid: number; cardId: string; name: string; element: Element;
  atk: number; hp: number; maxHp: number; keywords: Keyword[];
  shieldUp: boolean; sick: boolean; attacked: boolean; burning: boolean;
}
export interface SideState {
  hp: number; deck: string[]; hand: string[]; discard: string[];
  field: (Creature | null)[]; summoned: boolean; spelled: boolean; turnsTaken: number;
}
export interface DuelState {
  turn: number; active: Side; sides: Record<Side, SideState>; rng: number; nextUid: number;
  winner: Side | "captured" | null; itemUsed: boolean; failedThrows: number; log: string[];
  bonus: Record<string, { atk: number; hp: number }>; // player rank bonuses by card id
}
export type Action =
  | { kind: "summon"; handIndex: number; slot: number; tribute?: number }
  | { kind: "spell"; handIndex: number; target?: number }
  | { kind: "attack"; from: number; target: number | "direct" }
  | { kind: "end_turn" };

export const SLOTS = 3, HAND_CAP = 7, FATIGUE = 2, START_HAND = 5, TRIBUTE_COST = 3;

const other = (s: Side): Side => (s === "player" ? "enemy" : "player");
const byId = (data: GameData, id: string): CardDef => {
  const c = data.cards.find((x) => x.id === id);
  if (!c) throw new Error("Unknown card: " + id);
  return c;
};
export const needsTribute = (d: CardDef) => d.type === "creature" && d.cost >= TRIBUTE_COST;

function rand(s: DuelState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(s: DuelState, arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const blank = (hp: number): SideState => ({ hp, deck: [], hand: [], discard: [], field: [null, null, null], summoned: false, spelled: false, turnsTaken: 0 });

export function newDuel(data: GameData, playerDeck: string[], enemyDeck: string[], opts: { enemyHp?: number; playerHp?: number; seed?: number; bonus?: Record<string, { atk: number; hp: number }> } = {}): DuelState {
  const s: DuelState = {
    turn: 1, active: "player", sides: { player: blank(opts.playerHp ?? 20), enemy: blank(opts.enemyHp ?? 20) },
    rng: opts.seed ?? 1, nextUid: 1, winner: null, itemUsed: false, failedThrows: 0, log: [], bonus: opts.bonus ?? {},
  };
  s.sides.player.deck = shuffle(s, playerDeck);
  s.sides.enemy.deck = shuffle(s, enemyDeck);
  for (let i = 0; i < START_HAND; i++) { draw(s, "player", false); draw(s, "enemy", false); }
  startTurn(s, "player");
  return s;
}

function draw(s: DuelState, side: Side, fatigue: boolean): void {
  const sd = s.sides[side];
  if (sd.deck.length === 0) {
    if (fatigue) { sd.hp -= FATIGUE; s.log.push(side + " has no cards left and loses " + FATIGUE + " HP"); }
    return;
  }
  const card = sd.deck.shift() as string;
  if (sd.hand.length >= HAND_CAP) sd.discard.push(card); else sd.hand.push(card);
}

function startTurn(s: DuelState, side: Side): void {
  const sd = s.sides[side];
  sd.turnsTaken++; sd.summoned = false; sd.spelled = false;
  for (const c of sd.field) {
    if (!c) continue;
    c.sick = false; c.attacked = false;
    if (c.keywords.includes("regen")) c.hp = Math.min(c.maxHp, c.hp + 1);
  }
  if (!(side === "player" && sd.turnsTaken === 1)) draw(s, side, true);
  checkWinner(s);
}

function checkWinner(s: DuelState): void {
  if (s.winner) return;
  if (s.sides.player.hp <= 0) s.winner = "enemy"; else if (s.sides.enemy.hp <= 0) s.winner = "player";
}

const advantage = (data: GameData, a: Element, d: Element) => (data.elementCycle[a] === d ? 1 : 0);

// Returns overflow beyond the creature's remaining HP (for Pierce).
function hurt(c: Creature, dmg: number): number {
  if (dmg <= 0) return 0;
  if (c.shieldUp) { c.shieldUp = false; return 0; }
  const overflow = Math.max(0, dmg - Math.max(0, c.hp));
  c.hp -= dmg;
  return overflow;
}

function processDeaths(s: DuelState): void {
  let again = true;
  while (again) {
    again = false;
    for (const side of ["player", "enemy"] as Side[]) {
      const sd = s.sides[side];
      for (let i = 0; i < SLOTS; i++) {
        const c = sd.field[i];
        if (!c || c.hp > 0) continue;
        sd.field[i] = null; sd.discard.push(c.cardId); again = true;
        s.log.push(c.name + " was sealed");
        if (c.keywords.includes("last_spark")) {
          const foe = s.sides[other(side)];
          const t = foe.field.map((x, k) => (x ? k : -1)).filter((k) => k >= 0);
          if (t.length) hurt(foe.field[t[Math.floor(rand(s) * t.length)]] as Creature, 1);
        }
      }
    }
  }
}

function make(s: DuelState, def: CardDef, ready: boolean, side: Side): Creature {
  const kw = def.keywords ?? [];
  const b = side === "player" ? s.bonus[def.id] : undefined;
  return { uid: s.nextUid++, cardId: def.id, name: def.name, element: def.element, atk: (def.atk ?? 0) + (b?.atk ?? 0), hp: (def.hp ?? 1) + (b?.hp ?? 0), maxHp: (def.hp ?? 1) + (b?.hp ?? 0), keywords: [...kw], shieldUp: kw.includes("shield"), sick: ready ? false : !kw.includes("swift"), attacked: false, burning: false };
}

// Test and setup helper.
export function spawn(data: GameData, state: DuelState, side: Side, slot: number, cardId: string): DuelState {
  const s = structuredClone(state);
  s.sides[side].field[slot] = make(s, byId(data, cardId), true, side);
  return s;
}

export function apply(data: GameData, state: DuelState, action: Action): DuelState {
  if (state.winner) throw new Error("The duel is over");
  const s = structuredClone(state);
  const me = s.active, foe = other(me);
  const sd = s.sides[me], fd = s.sides[foe];

  if (action.kind === "summon") {
    if (sd.summoned) throw new Error("One summon per turn");
    const id = sd.hand[action.handIndex];
    if (!id) throw new Error("No card at that hand index");
    const def = byId(data, id);
    if (def.type !== "creature") throw new Error("That card is not a monster");
    if (action.slot < 0 || action.slot >= SLOTS) throw new Error("Bad zone");
    if (needsTribute(def)) {
      const t = action.tribute;
      if (t === undefined || !sd.field[t]) throw new Error("Needs a tribute");
      sd.discard.push((sd.field[t] as Creature).cardId); sd.field[t] = null;
    }
    if (sd.field[action.slot]) throw new Error("Zone is occupied");
    sd.hand.splice(action.handIndex, 1);
    sd.field[action.slot] = make(s, def, false, me);
    sd.summoned = true;
    s.log.push(me + " summons " + def.name);
    return s;
  }

  if (action.kind === "spell") {
    if (sd.spelled) throw new Error("One spell per turn");
    const id = sd.hand[action.handIndex];
    if (!id) throw new Error("No card at that hand index");
    const def = byId(data, id);
    if (def.type !== "action" || !def.effect) throw new Error("That card is not a spell");
    const eff = def.effect, t = action.target;
    if (eff.kind === "damage_creature") {
      const c = t === undefined ? null : fd.field[t];
      if (!c) throw new Error("Needs an enemy monster");
      hurt(c, eff.amount ?? 0);
    } else if (eff.kind === "heal_creature") {
      const c = t === undefined ? null : sd.field[t];
      if (!c) throw new Error("Needs one of your monsters");
      c.hp = Math.min(c.maxHp, c.hp + (eff.amount ?? 0));
    } else if (eff.kind === "bounce") {
      const c = t === undefined ? null : fd.field[t];
      if (!c) throw new Error("Needs an enemy monster");
      fd.field[t as number] = null;
      if (fd.hand.length >= HAND_CAP) fd.discard.push(c.cardId); else fd.hand.push(c.cardId);
    }
    sd.hand.splice(action.handIndex, 1); sd.discard.push(id); sd.spelled = true;
    s.log.push(me + " casts " + def.name);
    processDeaths(s); checkWinner(s);
    return s;
  }

  if (action.kind === "attack") {
    const a = sd.field[action.from];
    if (!a) throw new Error("No monster there");
    if (a.sick) throw new Error("That monster just arrived");
    if (a.attacked) throw new Error("Already attacked");
    if (action.target === "direct") {
      if (fd.field.some((c) => c)) throw new Error("Defenders block a direct attack");
      fd.hp -= a.atk; a.attacked = true;
      s.log.push(a.name + " strikes " + foe + " for " + a.atk);
    } else {
      const d = fd.field[action.target];
      if (!d) throw new Error("No target there");
      const dealt = a.atk + advantage(data, a.element, d.element);
      const back = d.atk + advantage(data, d.element, a.element) + (d.keywords.includes("thorns") ? 1 : 0);
      const overflow = hurt(d, dealt);
      hurt(a, back);
      if (a.keywords.includes("pierce") && overflow > 0) fd.hp -= overflow;
      if (a.keywords.includes("burn") && d.hp > 0) d.burning = true;
      a.attacked = true;
      s.log.push(a.name + " attacks " + d.name);
      processDeaths(s);
    }
    checkWinner(s);
    return s;
  }

  // end_turn: burning monsters on the foe's side take 1, then pass.
  for (const c of fd.field) if (c && c.burning) { hurt(c, 1); c.burning = false; }
  processDeaths(s); checkWinner(s);
  if (s.winner) return s;
  s.active = foe; s.itemUsed = false; s.turn++;
  startTurn(s, foe);
  return s;
}

export function throwSeal(state: DuelState, chance: number): { state: DuelState; success: boolean } {
  if (state.winner) throw new Error("The duel is over");
  if (state.active !== "player") throw new Error("Only the player can throw seals");
  const s = structuredClone(state);
  if (s.itemUsed) throw new Error("One item per turn");
  s.itemUsed = true;
  const success = rand(s) < chance;
  if (success) { s.winner = "captured"; s.log.push("Captured"); } else { s.failedThrows++; s.log.push("The seal broke"); }
  return { state: s, success };
}

const val = (c: Creature) => c.atk * 1.5 + c.hp + (c.keywords.length ? 1 : 0);

export function aiTurn(data: GameData, state: DuelState): DuelState {
  let s = state;
  let guard = 40;
  while (!s.winner && guard-- > 0) {
    const me = s.active, foe = other(me);
    const sd = s.sides[me], fd = s.sides[foe];
    const mine = sd.field.map((c, i) => (c ? { c, i } : null)).filter(Boolean) as { c: Creature; i: number }[];
    const theirs = fd.field.map((c, i) => (c ? { c, i } : null)).filter(Boolean) as { c: Creature; i: number }[];
    let next: Action | null = null;

    // spell
    if (!sd.spelled) {
      const dmgI = sd.hand.findIndex((id) => byId(data, id).effect?.kind === "damage_creature");
      if (dmgI >= 0 && theirs.length) {
        const amt = byId(data, sd.hand[dmgI]).effect?.amount ?? 0;
        const kill = theirs.filter((x) => x.c.hp <= amt && !x.c.shieldUp).sort((a, b) => val(b.c) - val(a.c))[0];
        const t = kill ?? [...theirs].sort((a, b) => b.c.atk - a.c.atk)[0];
        next = { kind: "spell", handIndex: dmgI, target: t.i };
      }
      const bounceI = sd.hand.findIndex((id) => byId(data, id).effect?.kind === "bounce");
      if (!next && bounceI >= 0 && theirs.length) next = { kind: "spell", handIndex: bounceI, target: [...theirs].sort((a, b) => val(b.c) - val(a.c))[0].i };
      const healI = sd.hand.findIndex((id) => byId(data, id).effect?.kind === "heal_creature");
      const hurtOne = mine.find((x) => x.c.hp < x.c.maxHp - 1);
      if (!next && healI >= 0 && hurtOne) next = { kind: "spell", handIndex: healI, target: hurtOne.i };
    }
    // summon
    if (!next && !sd.summoned) {
      const free = sd.field.findIndex((c) => !c);
      let best: { i: number; v: number; tribute?: number } | null = null;
      sd.hand.forEach((id, i) => {
        const d = byId(data, id);
        if (d.type !== "creature") return;
        const v = (d.atk ?? 0) * 1.5 + (d.hp ?? 1);
        if (needsTribute(d)) {
          if (!mine.length) return;
          const weakest = [...mine].sort((a, b) => val(a.c) - val(b.c))[0];
          if (v <= val(weakest.c) + 2) return;
          if (!best || v > best.v) best = { i, v, tribute: weakest.i };
        } else if (free >= 0 && (!best || v > best.v)) best = { i, v };
      });
      if (best) {
        const b = best as { i: number; v: number; tribute?: number };
        next = { kind: "summon", handIndex: b.i, slot: b.tribute !== undefined ? b.tribute : free, tribute: b.tribute };
      }
    }
    // attacks
    if (!next) {
      for (const { c, i } of mine) {
        if (c.sick || c.attacked) continue;
        if (!theirs.length) { next = { kind: "attack", from: i, target: "direct" }; break; }
        let pick: { t: number; score: number } | null = null;
        for (const { c: d, i: ti } of theirs) {
          const dealt = c.atk + advantage(data, c.element, d.element);
          const back = d.atk + advantage(data, d.element, c.element) + (d.keywords.includes("thorns") ? 1 : 0);
          const kills = !d.shieldUp && dealt >= d.hp;
          const dies = !c.shieldUp && back >= c.hp;
          const score = (kills ? val(d) : 0) - (dies ? val(c) : 0) + (kills && !dies ? 2 : 0);
          if (score > 0 && (!pick || score > pick.score)) pick = { t: ti, score };
        }
        if (pick) { next = { kind: "attack", from: i, target: pick.t }; break; }
      }
    }
    if (!next) next = { kind: "end_turn" };
    s = apply(data, s, next);
    if (next.kind === "end_turn") break;
  }
  return s;
}
