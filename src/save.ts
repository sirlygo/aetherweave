// Local save: collection (card id -> copies), deck, seal bag. Phase 1 only; replace with real save later.
export interface Save { collection: Record<string, number>; deck: string[]; bag: Record<string, number>; v: 1 }
const KEY = "aetherweave.save.v1";
export function defaultSave(starter: string[]): Save {
  const collection: Record<string, number> = {};
  for (const id of starter) collection[id] = (collection[id] || 0) + 1;
  return { v: 1, collection, deck: [...new Set(starter.filter((id) => !["flare", "ripple", "gust"].includes(id)))].concat(["flare", "ripple", "gust"]), bag: { plain: 5, ember: 2, tide: 1, dusk: 1, midnight: 1 } };
}
export function load(starter: string[]): Save {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.v === 1) return s; } catch { /* ignore */ }
  return defaultSave(starter);
}
export function store(s: Save) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
