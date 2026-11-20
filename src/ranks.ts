// Rank 1..5. Raising from rank r to r+1 consumes r spare copies (10 copies in total for Rank 5).
export const MAX_RANK = 5;
export const BONUS: Record<number, { atk: number; hp: number }> = { 1: { atk: 0, hp: 0 }, 2: { atk: 0, hp: 1 }, 3: { atk: 1, hp: 1 }, 4: { atk: 1, hp: 2 }, 5: { atk: 2, hp: 2 } };
export const copiesToRank = (rank: number) => rank; // cost to go from `rank` to `rank + 1`
export function bonusMap(ranks: Record<string, number>) {
  const m: Record<string, { atk: number; hp: number }> = {};
  for (const [id, r] of Object.entries(ranks)) if (r > 1) m[id] = BONUS[Math.min(r, MAX_RANK)];
  return m;
}
