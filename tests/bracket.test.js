// Plain assert-based test harness for the bracket algorithm. No test
// framework/dependency: run with `node tests/bracket.test.js`.
// bracket.js has zero DOM dependencies, so it runs fine directly under Node.

import { generateBracket, completeMatch } from "../js/bracket.js";
import { nextPowerOfTwo, log2 } from "../js/util.js";

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

function makeTeamIds(n) {
  return Array.from({ length: n }, (_, i) => `team${i + 1}`);
}

function readyMatches(state) {
  return state.matchOrder.map((id) => state.matches[id]).filter((m) => m.status === "ready");
}

// Plays every ready match repeatedly (in matchOrder for determinism / easy
// debugging) using chooseWinner(match) -> winnerId, skipping `stopMatchId` if
// given, until no more ready matches (other than the stop match) remain.
function playAllExcept(state, chooseWinner, stopMatchId = null) {
  let iterations = 0;
  const maxIterations = 10000;
  while (iterations++ < maxIterations) {
    const ready = readyMatches(state).filter((m) => m.id !== stopMatchId);
    if (ready.length === 0) break;
    for (const m of ready) {
      const winnerId = chooseWinner(m);
      completeMatch(state, m.id, winnerId);
    }
  }
  assert(iterations < maxIterations, "simulation did not terminate (possible infinite loop / bad wiring)");
}

function newTestState(teamIds) {
  const bracket = generateBracket(teamIds);
  return {
    matches: bracket.matches,
    matchOrder: bracket.matchOrder,
    grandFinal: bracket.grandFinal,
    championTeamId: null,
    phase: "live",
  };
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

// ---- Structural checks across a range of team counts ----
const teamCounts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 16];

for (const n of teamCounts) {
  test(`n=${n}: bracket structure is well-formed`, () => {
    const teamIds = makeTeamIds(n);
    const state = newTestState(teamIds);
    const size = nextPowerOfTwo(n);
    const k = log2(size);

    const wbMatches = Object.values(state.matches).filter((m) => m.bracket === "winners");
    const lbMatches = Object.values(state.matches).filter((m) => m.bracket === "losers");

    assert(wbMatches.length === size - 1, `expected ${size - 1} WB matches, got ${wbMatches.length}`);

    const wbRoundCounts = {};
    for (const m of wbMatches) wbRoundCounts[m.round] = (wbRoundCounts[m.round] || 0) + 1;
    assert(Object.keys(wbRoundCounts).length === k, `expected ${k} WB rounds`);

    if (k > 1) {
      const lbRoundNumbers = new Set(lbMatches.map((m) => m.round));
      assert(lbRoundNumbers.size === 2 * (k - 1), `expected ${2 * (k - 1)} LB rounds, got ${lbRoundNumbers.size}`);
    } else {
      assert(lbMatches.length === 0, "k=1 should have no losers bracket matches");
    }

    // No match should ever have two byes (both sides null) or reference a
    // nonexistent source match.
    for (const m of Object.values(state.matches)) {
      if (m.teamASource) assert(state.matches[m.teamASource.matchId], `dangling teamASource on ${m.id}`);
      if (m.teamBSource) assert(state.matches[m.teamBSource.matchId], `dangling teamBSource on ${m.id}`);
    }
  });

  test(`n=${n}: random playout produces exactly one champion with correct loss counts`, () => {
    const teamIds = makeTeamIds(n);
    const state = newTestState(teamIds);

    playAllExcept(state, (m) => {
      const candidates = [m.teamAId, m.teamBId].filter((id) => id != null);
      return candidates[Math.floor(Math.random() * candidates.length)];
    });

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
  });
}

// ---- Grand final: no reset needed (WB champion wins game 1) ----
test("grand final: WB champion wins game 1, no reset played", () => {
  const teamIds = makeTeamIds(6);
  const state = newTestState(teamIds);
  const chooseA = (m) => m.teamAId;

  playAllExcept(state, chooseA, "gf-1");

  const gf1 = state.matches["gf-1"];
  assert(gf1.status === "ready", "gf-1 should be ready after playing everything else");
  completeMatch(state, "gf-1", gf1.teamAId); // WB champion (teamA source) wins

  assert(state.grandFinal.resetNeeded === false, "resetNeeded should be false");
  assert(state.phase === "complete", "phase should be complete");
  assert(state.championTeamId === gf1.teamAId, "champion should be the WB-side winner");

  const reset = state.matches["gf-2"];
  assert(reset.status === "pending", "reset match should remain unplayed");
  assert(reset.teamAId == null && reset.teamBId == null, "reset match should never have been populated");
});

// ---- Grand final: reset triggered (LB champion wins game 1) ----
test("grand final: LB champion wins game 1, bracket reset is played", () => {
  const teamIds = makeTeamIds(6);
  const state = newTestState(teamIds);
  const chooseA = (m) => m.teamAId;

  playAllExcept(state, chooseA, "gf-1");

  const gf1 = state.matches["gf-1"];
  assert(gf1.status === "ready", "gf-1 should be ready after playing everything else");
  completeMatch(state, "gf-1", gf1.teamBId); // LB champion (teamB source) wins

  assert(state.grandFinal.resetNeeded === true, "resetNeeded should be true");
  assert(state.phase !== "complete", "phase should not be complete yet, reset still to play");

  const reset = state.matches["gf-2"];
  assert(reset.status === "ready", "reset match should now be ready");
  assert(reset.teamAId === gf1.teamAId, "reset teamA should be the original WB champion");
  assert(reset.teamBId === gf1.teamBId, "reset teamB should be the LB champion");

  // WB champion (now with one loss) wins the reset -> they take the title.
  completeMatch(state, "gf-2", reset.teamAId);
  assert(state.phase === "complete", "phase should be complete after reset");
  assert(state.championTeamId === reset.teamAId, "champion should be reset winner (WB side)");

  // Re-run with the LB side winning the reset instead.
  const state2 = newTestState(teamIds);
  playAllExcept(state2, chooseA, "gf-1");
  const gf1b = state2.matches["gf-1"];
  completeMatch(state2, "gf-1", gf1b.teamBId);
  const reset2 = state2.matches["gf-2"];
  completeMatch(state2, "gf-2", reset2.teamBId);
  assert(state2.phase === "complete", "phase should be complete after reset (LB side wins)");
  assert(state2.championTeamId === reset2.teamBId, "champion should be reset winner (LB side)");
});

// ---- Bye handling sanity check for a specific non-power-of-2 case ----
test("n=5: exactly one real match in WB round 1 (3 byes, size=8)", () => {
  const teamIds = makeTeamIds(5);
  const state = newTestState(teamIds);
  const round1 = Object.values(state.matches).filter((m) => m.bracket === "winners" && m.round === 1);
  const byeCount = round1.filter((m) => m.isBye).length;
  const realCount = round1.filter((m) => !m.isBye).length;
  assert(byeCount === 3, `expected 3 byes in round 1, got ${byeCount}`);
  assert(realCount === 1, `expected 1 real match in round 1, got ${realCount}`);
  // Bye winners should already be propagated into round 2.
  const round2 = Object.values(state.matches).filter((m) => m.bracket === "winners" && m.round === 2);
  const filledSlots = round2.reduce(
    (acc, m) => acc + (m.teamAId != null ? 1 : 0) + (m.teamBId != null ? 1 : 0),
    0
  );
  assert(filledSlots === 3, `expected 3 pre-filled round-2 slots from byes, got ${filledSlots}`);
});

// ---- Report ----
console.log(`${passCount} passed, ${failures.length} failed`);
for (const f of failures) console.log(`FAIL: ${f}`);
if (failures.length > 0) process.exit(1);
