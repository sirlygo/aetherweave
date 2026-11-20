import type { CardDef } from "../engine/battle.ts";
import type { Save } from "../save.ts";
export const MIN_DECK = 8, MAX_DECK = 30, SPELL_MAX = 2;
const ICON: Record<string, string> = { fire: "🔥", water: "💧", storm: "⚡", nature: "🌿" };

export function deckLimit(d: CardDef, owned: number) { return d.type === "creature" ? 1 : Math.min(SPELL_MAX, owned); }

export function renderDeck(host: HTMLElement, cards: CardDef[], save: Save, onBack: () => void, onChange: () => void) {
  const count = (id: string) => save.deck.filter((x) => x === id).length;
  const owned = cards.filter((c) => save.collection[c.id]);
  const ok = save.deck.length >= MIN_DECK && save.deck.length <= MAX_DECK;
  host.innerHTML = `<div class="bar"><span>Collection</span><span class="${ok ? "en" : "hp"}">Deck ${save.deck.length}/${MAX_DECK} (min ${MIN_DECK})</span></div>
    <div class="items">${owned.map((c) => {
      const n = count(c.id), lim = deckLimit(c, save.collection[c.id]);
      const stat = c.type === "creature" ? `⚔${c.atk} ♥${c.hp} · ${(c.keywords || []).join(", ") || "no keyword"}` : `Spell · ${c.effect?.kind.replace("_", " ")}`;
      return `<div class="item ${n ? "sel" : ""}"><span>${ICON[c.element]} ${c.name}${(save.ranks[c.id] || 1) > 1 ? " " + "★".repeat(save.ranks[c.id]) : ""} <small>${c.cost} energy · ${stat} · owned ×${save.collection[c.id]}</small></span><span style="display:flex;gap:6px;align-items:center"><button class="alt mini" data-dec="${c.id}" ${n ? "" : "disabled"}>−</button><b>${n}/${lim}</b><button class="alt mini" data-inc="${c.id}" ${n >= lim || save.deck.length >= MAX_DECK ? "disabled" : ""}>+</button></span></div>`;
    }).join("")}</div>
    <div class="btns"><button id="back" ${ok ? "" : "disabled"}>${ok ? "Done" : "Deck needs " + MIN_DECK + "+ cards"}</button></div>`;
  host.querySelectorAll<HTMLElement>("[data-inc]").forEach((b) => b.onclick = () => { save.deck.push(b.dataset.inc!); onChange(); renderDeck(host, cards, save, onBack, onChange); });
  host.querySelectorAll<HTMLElement>("[data-dec]").forEach((b) => b.onclick = () => { save.deck.splice(save.deck.lastIndexOf(b.dataset.dec!), 1); onChange(); renderDeck(host, cards, save, onBack, onChange); });
  document.getElementById("back")!.onclick = onBack;
}
