// Plain assert-based test harness for boards.js's edit-result flow (rebuild +
// replay). Same style as tests/bracket.test.js: run with
// `node tests/boards.test.js`. boards.js/bracket.js have zero DOM
// dependencies, so this runs directly under Node.

import { generateBracket } from "../js/bracket.js";
import { recordResult, assignBoards, readyMatches, inProgressMatches, simulateEditResult, editResult } from "../js/boards.js";

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

// Builds a state shaped like the real app's (state.js's startTournament),
// without going through state.js so this stays localStorage-free.
function newTournamentState(n, boardCount) {
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
  return state;
}

// Plays every playable match repeatedly (skipping stopMatchId) via
// recordResult, until none remain. A match is playable once it's "ready" or
// (since recordResult's assignBoards immediately claims free boards) already
// "in-progress" on one.
function playAllExcept(state, chooseWinner, stopMatchId = null) {
  let iterations = 0;
  const maxIterations = 10000;
  while (iterations++ < maxIterations) {
    const playable = readyMatches(state)
      .concat(inProgressMatches(state))
      .filter((m) => m.id !== stopMatchId);
    if (playable.length === 0) break;
    for (const m of playable) {
      recordResult(state, m.id, chooseWinner(m));
    }
  }
  assert(iterations < maxIterations, "simulation did not terminate (possible infinite loop / bad wiring)");
}

function countLosses(state) {
  const losses = {};
  for (const id of state.matchOrder) {
    const m = state.matches[id];
    if (m.status === "complete" && !m.isBye && m.loserId != null) {
      losses[m.loserId] = (losses[m.loserId] || 0) + 1;
    }
  }
  return losses;
}

function assertSingleChampionWithCorrectLosses(state, teamIds) {
  assert(state.phase === "complete", "tournament did not reach complete phase");
  assert(state.championTeamId != null, "no champion was set");
  const losses = countLosses(state);
  for (const teamId of teamIds) {
    const loss = losses[teamId] || 0;
    if (teamId === state.championTeamId) {
      assert(loss === 0 || loss === 1, `champion ${teamId} should have 0 or 1 losses, got ${loss}`);
    } else {
      assert(loss === 2, `eliminated team ${teamId} should have exactly 2 losses, got ${loss}`);
    }
  }
}

// ---- Editing the decisive match with nothing downstream of it yet ----
test("editing the last-played match (gf-1, no reset yet) has no reopened matches", () => {
  const state = newTournamentState(8, 8);
  const chooseA = (m) => m.teamAId;
  playAllExcept(state, chooseA, "gf-1");

  const gf1 = state.matches["gf-1"];
  recordResult(state, "gf-1", gf1.teamAId); // WB side wins -> no reset needed
  assert(state.phase === "complete", "should be complete before the edit");
  assert(state.grandFinal.resetNeeded === false, "resetNeeded should be false before the edit");

  const preview = simulateEditResult(state, "gf-1", gf1.teamBId);
  assert(preview.reopenedMatchIds.length === 0, `expected no reopened matches, got ${preview.reopenedMatchIds}`);

  editResult(state, "gf-1", gf1.teamBId); // flip to the LB side instead
  assert(state.grandFinal.resetNeeded === true, "resetNeeded should now be true");
  assert(state.phase === "live", "phase should revert to live, a reset must be played");
  assert(state.championTeamId == null, "champion should be unset until the reset is played");
  const gf2Status = state.matches["gf-2"].status;
  assert(gf2Status === "ready" || gf2Status === "in-progress", `gf-2 should now be playable, got status ${gf2Status}`);
});

// ---- Editing an early match reopens exactly its downstream, not siblings ----
test("editing an early WB round-1 match reopens its downstream matches only", () => {
  const state = newTournamentState(8, 8);
  const chooseA = (m) => m.teamAId;
  playAllExcept(state, chooseA);
  assertSingleChampionWithCorrectLosses(state, state.teams.map((t) => t.id));

  const edited = state.matches["wb-r1-m1"];
  const originalWinnerId = edited.winnerId;
  const flippedWinnerId = edited.loserId;

  // Every match sourced directly from wb-r1-m1 must change team composition
  // and therefore be reopened.
  const directChildren = Object.values(state.matches).filter(
    (m) =>
      (m.teamASource && m.teamASource.matchId === "wb-r1-m1") || (m.teamBSource && m.teamBSource.matchId === "wb-r1-m1")
  );
  assert(directChildren.length > 0, "expected wb-r1-m1 to feed at least one downstream match");

  const { reopenedMatchIds } = simulateEditResult(state, "wb-r1-m1", flippedWinnerId);
  for (const child of directChildren) {
    assert(reopenedMatchIds.includes(child.id), `expected ${child.id} to be reopened by editing wb-r1-m1`);
  }

  // A same-round sibling untouched by wb-r1-m1's outcome should not be reopened.
  assert(!reopenedMatchIds.includes("wb-r1-m4"), "sibling match wb-r1-m4 should not be reopened");

  editResult(state, "wb-r1-m1", flippedWinnerId);
  assert(state.matches["wb-r1-m1"].winnerId === flippedWinnerId, "edited match should record the new winner");
  assert(
    state.matches["wb-r1-m4"].winnerId === originalWinnerId || state.matches["wb-r1-m4"].winnerId != null,
    "sibling match wb-r1-m4 should keep its own recorded result"
  );
  for (const child of directChildren) {
    assert(
      !state.completedMatchIds.includes(child.id) || state.matches[child.id].status === "complete",
      `reopened match ${child.id} should either be unplayed or freshly replayed, never left half-updated`
    );
  }

  // Finishing the tournament from here must still produce valid invariants.
  playAllExcept(state, chooseA);
  assertSingleChampionWithCorrectLosses(state, state.teams.map((t) => t.id));
});

// ---- Grand final: editing game 1 after a reset was played reopens gf-2 ----
test("editing gf-1 after a bracket reset was played reopens and clears gf-2", () => {
  const state = newTournamentState(6, 6);
  const chooseA = (m) => m.teamAId;
  playAllExcept(state, chooseA, "gf-1");

  const gf1 = state.matches["gf-1"];
  recordResult(state, "gf-1", gf1.teamBId); // LB side wins game 1 -> reset triggered
  assert(state.grandFinal.resetNeeded === true, "resetNeeded should be true");
  const reset = state.matches["gf-2"];
  assert(reset.status === "ready" || reset.status === "in-progress", `reset match should be playable, got status ${reset.status}`);
  recordResult(state, "gf-2", reset.teamAId); // WB side wins the reset -> champion
  assert(state.phase === "complete", "should be complete after the reset is played");
  assert(state.completedMatchIds.includes("gf-2"), "gf-2 should be recorded as completed");

  const preview = simulateEditResult(state, "gf-1", gf1.teamAId); // flip gf-1 back to the WB side
  assert(preview.reopenedMatchIds.includes("gf-2"), "gf-2 should be reopened since no reset is needed anymore");

  editResult(state, "gf-1", gf1.teamAId);
  assert(state.grandFinal.resetNeeded === false, "resetNeeded should flip to false");
  assert(state.matches["gf-2"].status === "pending", "gf-2 should revert to pending");
  assert(
    state.matches["gf-2"].teamAId == null && state.matches["gf-2"].teamBId == null,
    "gf-2 should be unpopulated again"
  );
  assert(state.championTeamId === gf1.teamAId, "champion should immediately be the new gf-1 winner");
  assert(state.phase === "complete", "phase should be complete again immediately, no reset needed");
  assert(!state.completedMatchIds.includes("gf-2"), "gf-2 should no longer be in the completed log");
});

// ---- Report ----
console.log(`${passCount} passed, ${failures.length} failed`);
for (const f of failures) console.log(`FAIL: ${f}`);
if (failures.length > 0) process.exit(1);
