// Ready-match queue and automatic board assignment.

import { completeMatch, generateBracket } from "./bracket.js";

export function readyMatches(state) {
  return state.matchOrder.map((id) => state.matches[id]).filter((m) => m.status === "ready");
}

export function inProgressMatches(state) {
  return state.matchOrder.map((id) => state.matches[id]).filter((m) => m.status === "in-progress");
}

// Fills any free boards with the next ready matches (in stable match order).
export function assignBoards(state) {
  const freeBoards = state.boards.filter((b) => b.matchId === null);
  const queue = readyMatches(state);
  for (const board of freeBoards) {
    const next = queue.shift();
    if (!next) break;
    board.matchId = next.id;
    next.boardNumber = board.number;
    next.status = "in-progress";
  }
}

function freeBoardForMatch(state, matchId) {
  const board = state.boards.find((b) => b.matchId === matchId);
  if (board) board.matchId = null;
}

// Single mutation entry point for recording a match result: advances the
// bracket, frees the board that match was on, and fills any now-free boards
// with newly-ready matches.
export function recordResult(state, matchId, winnerId) {
  freeBoardForMatch(state, matchId);
  completeMatch(state, matchId, winnerId);
  (state.completedMatchIds = state.completedMatchIds || []).push(matchId);
  assignBoards(state);
  return state;
}

// Rebuilds the bracket from scratch (same team ids, same board names) and
// replays every previously-completed decision in original order, substituting
// `newWinnerId` for `matchId`. A replayed decision that no longer names a
// valid participant of its match — because the edit changed who reached that
// match — is skipped instead, which leaves that match (and anything further
// downstream) open to be played again. Pure: does not mutate `state`. Returns
// the rebuilt fields plus `reopenedMatchIds`, the ids of matches that got
// reopened as a consequence of the edit.
export function simulateEditResult(state, matchId, newWinnerId) {
  const decisions = (state.completedMatchIds || []).map((id) => ({
    id,
    winnerId: id === matchId ? newWinnerId : state.matches[id].winnerId,
  }));

  const bracket = generateBracket(state.teams.map((t) => t.id));
  const next = {
    matches: bracket.matches,
    matchOrder: bracket.matchOrder,
    grandFinal: bracket.grandFinal,
    boards: state.boardNames.map((name, i) => ({ number: i + 1, name, matchId: null })),
    championTeamId: null,
    completedMatchIds: [],
    phase: "live",
  };
  assignBoards(next);

  const reopenedMatchIds = [];
  for (const { id, winnerId } of decisions) {
    const m = next.matches[id];
    const isPlayable = m.status === "ready" || m.status === "in-progress";
    if (!isPlayable || (winnerId !== m.teamAId && winnerId !== m.teamBId)) {
      reopenedMatchIds.push(id);
      continue;
    }
    recordResult(next, id, winnerId);
  }

  return { ...next, reopenedMatchIds };
}

// Commits the result of simulateEditResult() onto the real state, leaving
// teams/players/boardNames/version/createdAt untouched. Returns the ids of
// any matches that were reopened as a side effect of the edit.
export function editResult(state, matchId, newWinnerId) {
  const { reopenedMatchIds, ...fields } = simulateEditResult(state, matchId, newWinnerId);
  Object.assign(state, fields);
  return reopenedMatchIds;
}
