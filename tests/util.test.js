// Plain assert-based test harness for util.js's historical-results helpers
// (hasDiagramData / buildHistoricalBracketState). Same style as
// tests/bracket.test.js / tests/boards.test.js: run with
// `node tests/util.test.js`. util.js/bracket.js/boards.js have zero DOM
// dependencies, so this runs directly under Node — unlike export.js, which
// pulls in i18n.js (a `localStorage` read at module-eval time) and can't be
// imported here, so a v2-style summary is hand-shaped below rather than
// built via buildResultsSummary().

import { generateBracket } from "../js/bracket.js";
import { recordResult, assignBoards, readyMatches, inProgressMatches } from "../js/boards.js";
import { teamRecords, hasDiagramData, buildHistoricalBracketState } from "../js/util.js";

let passCount = 0;
let failures = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    passCount++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

function makeTeams(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `team${i + 1}`, name: `Team ${i + 1}` }));
}

function playToCompletion(n, boardCount) {
  const teams = makeTeams(n);
  const bracket = generateBracket(teams.map((t) => t.id));
  const boardNames = Array.from({ length: boardCount }, (_, i) => `Board ${i + 1}`);
  const state = {
    teams,
    boardNames,
    matches: bracket.matches,
    matchOrder: bracket.matchOrder,
    grandFinal: bracket.grandFinal,
    boards: boardNames.map((name, i) => ({ number: i + 1, name, matchId: null })),
    championTeamId: null,
    completedMatchIds: [],
    phase: "live",
  };
  assignBoards(state);

  let iterations = 0;
  while (state.phase !== "complete" && iterations++ < 10000) {
    const playable = readyMatches(state).concat(inProgressMatches(state));
    for (const m of playable) recordResult(state, m.id, m.teamAId);
  }
  assert(state.phase === "complete", "fixture tournament did not complete");
  return state;
}

// Mirrors the fields buildResultsSummary() (export.js) adds under
// schemaVersion 2 — not imported from there since export.js can't run
// under Node (see header comment).
function summaryFromState(state, schemaVersion = 2) {
  const matches = Object.values(state.matches).map((m) => ({
    id: schemaVersion >= 2 ? m.id : undefined,
    bracket: m.bracket,
    round: m.round,
    status: m.status,
    isBye: m.isBye,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerId: m.winnerId,
    loserId: m.loserId,
    teamASource: m.teamASource,
    teamBSource: m.teamBSource,
  }));
  return {
    schemaVersion,
    teams: state.teams.map((tm) => ({ id: tm.id, name: tm.name })),
    matches,
  };
}

// ---- hasDiagramData ----
test("hasDiagramData is true for a well-formed schemaVersion 2 summary", () => {
  const summary = summaryFromState(playToCompletion(8, 8));
  assert(hasDiagramData(summary) === true, "expected true");
});

test("hasDiagramData is false for a schemaVersion 1 summary", () => {
  const summary = summaryFromState(playToCompletion(8, 8), 1);
  assert(hasDiagramData(summary) === false, "expected false");
});

test("hasDiagramData is false when matches is empty", () => {
  const summary = { schemaVersion: 2, teams: [], matches: [] };
  assert(hasDiagramData(summary) === false, "expected false");
});

test("hasDiagramData is false for schemaVersion 2 matches missing ids", () => {
  const summary = summaryFromState(playToCompletion(8, 8));
  summary.matches = summary.matches.map((m) => ({ ...m, id: undefined }));
  assert(hasDiagramData(summary) === false, "expected false");
});

// ---- buildHistoricalBracketState ----
test("buildHistoricalBracketState records match teamRecords() on the live matches", () => {
  const state = playToCompletion(8, 8);
  const summary = summaryFromState(state);
  const { records } = buildHistoricalBracketState(summary);
  const liveRecords = teamRecords(state.matches);

  const teamIds = state.teams.map((tm) => tm.id);
  for (const id of teamIds) {
    const live = liveRecords[id] || { wins: 0, losses: 0 };
    const historical = records[id] || { wins: 0, losses: 0 };
    assert(
      live.wins === historical.wins && live.losses === historical.losses,
      `record mismatch for ${id}: live ${JSON.stringify(live)} vs historical ${JSON.stringify(historical)}`
    );
  }
});

test("buildHistoricalBracketState partitions winners/losers matches with no overlap or omissions", () => {
  const state = playToCompletion(7, 4);
  const summary = summaryFromState(state);
  const { wbMatches, lbMatches } = buildHistoricalBracketState(summary);

  const wbIds = new Set(wbMatches.map((m) => m.id));
  const lbIds = new Set(lbMatches.map((m) => m.id));
  for (const id of wbIds) assert(!lbIds.has(id), `${id} appears in both winners and losers brackets`);

  const expectedWb = summary.matches.filter((m) => m.bracket === "winners").length;
  const expectedLb = summary.matches.filter((m) => m.bracket === "losers").length;
  assert(wbMatches.length === expectedWb, `expected ${expectedWb} winners-bracket matches, got ${wbMatches.length}`);
  assert(lbMatches.length === expectedLb, `expected ${expectedLb} losers-bracket matches, got ${lbMatches.length}`);
});

// ---- Report ----
console.log(`${passCount} passed, ${failures.length} failed`);
for (const f of failures) console.log(`FAIL: ${f}`);
if (failures.length > 0) process.exit(1);
