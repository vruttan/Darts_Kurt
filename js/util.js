// Pure, dependency-free helpers used by bracket.js and elsewhere.

export function nextPowerOfTwo(n) {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

export function log2(n) {
  return Math.round(Math.log2(n));
}

// Fisher-Yates shuffle. Returns a new array; does not mutate input.
export function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Standard recursive seed-order construction for a balanced single-elimination
// bracket of `size` slots (size must be a power of 2). Returns an array of
// 1-indexed seed numbers in bracket-slot order, e.g. seedOrder(8) =>
// [1, 8, 4, 5, 2, 7, 3, 6]. This spreads byes/top seeds evenly across the
// bracket rather than stacking them.
export function seedOrder(size) {
  if (size === 1) return [1];
  const half = seedOrder(size / 2);
  const out = [];
  for (const s of half) {
    out.push(s);
    out.push(size + 1 - s);
  }
  return out;
}

// Tally wins/losses per team across completed matches. Byes don't count as
// played games. Returns a map of teamId -> { wins, losses }.
export function teamRecords(matches) {
  const records = {};
  const rec = (id) => (records[id] = records[id] || { wins: 0, losses: 0 });
  for (const m of Object.values(matches)) {
    if (m.status !== "complete" || m.isBye) continue;
    if (m.winnerId != null) rec(m.winnerId).wins += 1;
    if (m.loserId != null) rec(m.loserId).losses += 1;
  }
  return records;
}

let idCounter = 0;
export function makeId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
