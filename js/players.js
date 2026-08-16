// Player entry, random team pairing, and odd-player-sits-out handling.

import { shuffle, makeId } from "./util.js";

export function addPlayer(state, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const player = { id: makeId("p"), name: trimmed, sittingOut: false };
  state.players.push(player);
  return player;
}

export function removePlayer(state, playerId) {
  state.players = state.players.filter((p) => p.id !== playerId);
}

function teamName(players, playerIds) {
  return playerIds.map((id) => players.find((p) => p.id === id).name).join(" & ");
}

// Randomly pairs all players into teams of 2. If the player count is odd,
// one randomly chosen player sits out. Overwrites any existing teams.
export function generateTeams(state) {
  const shuffled = shuffle(state.players);
  const pool = shuffled.slice();
  let sitOutPlayer = null;
  if (pool.length % 2 === 1) {
    sitOutPlayer = pool.pop();
  }

  const teams = [];
  for (let i = 0; i < pool.length; i += 2) {
    const playerIds = [pool[i].id, pool[i + 1].id];
    teams.push({ id: makeId("t"), name: teamName(state.players, playerIds), playerIds });
  }

  for (const p of state.players) {
    p.sittingOut = sitOutPlayer != null && p.id === sitOutPlayer.id;
  }
  state.teams = teams;
  return { sitOutPlayerId: sitOutPlayer ? sitOutPlayer.id : null };
}

// Begins (or restarts) manual pairing: clears any existing teams and puts
// every player back in the unpaired pool.
export function startManualPairing(state) {
  state.teams = [];
  state.manualPairing = { unpairedIds: state.players.map((p) => p.id), selectedId: null };
  for (const p of state.players) p.sittingOut = false;
}

// True once no more pairs can be formed (0 players left, or 1 sitting out).
export function isManualPairingComplete(state) {
  const mp = state.manualPairing;
  return !mp || mp.unpairedIds.length <= 1;
}

function updateManualSitOut(state) {
  const mp = state.manualPairing;
  for (const p of state.players) p.sittingOut = false;
  if (mp.unpairedIds.length === 1) {
    const p = state.players.find((pl) => pl.id === mp.unpairedIds[0]);
    if (p) p.sittingOut = true;
  }
}

// Tapping a player during manual pairing either selects them (first tap),
// deselects them (tapping the same player again), or pairs them with the
// currently-selected player into a new team (tapping a different player).
export function selectManualPlayer(state, playerId) {
  const mp = state.manualPairing;
  if (!mp || !mp.unpairedIds.includes(playerId)) return;

  if (mp.selectedId === playerId) {
    mp.selectedId = null;
    return;
  }

  if (mp.selectedId == null) {
    mp.selectedId = playerId;
    return;
  }

  const playerIds = [mp.selectedId, playerId];
  state.teams.push({ id: makeId("t"), name: teamName(state.players, playerIds), playerIds });
  mp.unpairedIds = mp.unpairedIds.filter((id) => !playerIds.includes(id));
  mp.selectedId = null;
  updateManualSitOut(state);
}

// Breaks up a manually-formed team, returning both players to the unpaired pool.
export function undoManualTeam(state, teamId) {
  const idx = state.teams.findIndex((t) => t.id === teamId);
  if (idx === -1) return;
  const [team] = state.teams.splice(idx, 1);
  state.manualPairing.unpairedIds.push(...team.playerIds);
  updateManualSitOut(state);
}

// Swaps who sits out: the given player takes the current sit-out player's
// place on a team, and the current sit-out player sits out instead. Only
// meaningful when the player count is odd (i.e. there is a sit-out slot).
export function setSitOutPlayer(state, playerId) {
  const currentSitOut = state.players.find((p) => p.sittingOut);
  if (!currentSitOut || currentSitOut.id === playerId) return;

  const team = state.teams.find((t) => t.playerIds.includes(playerId));
  if (!team) return;

  team.playerIds = team.playerIds.map((id) => (id === playerId ? currentSitOut.id : id));
  team.name = teamName(state.players, team.playerIds);

  const incoming = state.players.find((p) => p.id === playerId);
  incoming.sittingOut = true;
  currentSitOut.sittingOut = false;
}
