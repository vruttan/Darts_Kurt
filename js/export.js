// Client-side only export: HTML report + JSON data dump, via Blob + anchor
// download. No server involved.

import { teamRecords } from "./util.js";
import { t, getLanguage } from "./i18n.js";

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function teamLabel(state, id) {
  const team = state.teams.find((tm) => tm.id === id);
  return team ? team.name : t("tbd");
}

export function getRunnerUpId(state) {
  const gf1 = state.matches[state.grandFinal.game1MatchId];
  const gf2 = state.matches[state.grandFinal.resetMatchId];
  const decisive = gf2.status === "complete" ? gf2 : gf1;
  return decisive.loserId;
}

function playerNames(state, team) {
  return team.playerIds.map((id) => state.players.find((p) => p.id === id)?.name || "?");
}

// Curates the full internal state down to what's useful for cross-tournament
// stats: team/player *names* rather than internal ids (ids are per-session
// counters, not stable across separate tournaments), plus derived standings
// and elimination info. This is the shape saved both locally (exportJSON)
// and to the GitHub results repo (see github.js).
export function buildResultsSummary(state) {
  const records = teamRecords(state.matches);
  const runnerUpId = getRunnerUpId(state);
  const allMatches = state.matchOrder.map((id) => state.matches[id]);

  // Each team's last completed, non-bye loss determines where it was
  // eliminated. The champion never loses, so both fields stay null for them.
  // Walking completedMatchIds (true chronological play order) rather than
  // comparing `round` numbers matters here: round numbering restarts in each
  // bracket (winners round 1, losers round 1, grand final round 1 are all
  // "round 1"), so the last entry written below is genuinely the latest
  // match played, regardless of which bracket it was in.
  const lastLoss = {};
  for (const id of state.completedMatchIds || []) {
    const m = state.matches[id];
    if (!m || m.isBye || m.loserId == null) continue;
    lastLoss[m.loserId] = m;
  }

  const standings = state.teams
    .map((team) => {
      const r = records[team.id] || { wins: 0, losses: 0 };
      const loss = lastLoss[team.id];
      const isChampion = team.id === state.championTeamId;
      return {
        teamId: team.id,
        isChampion,
        isRunnerUp: team.id === runnerUpId,
        teamName: team.name,
        players: playerNames(state, team),
        wins: r.wins,
        losses: r.losses,
        eliminatedBracket: isChampion ? null : loss ? loss.bracket : null,
        eliminatedRound: isChampion ? null : loss ? loss.round : null,
      };
    })
    .sort((a, b) => {
      if (a.isChampion || b.isChampion) return a.isChampion ? -1 : 1;
      if (a.isRunnerUp || b.isRunnerUp) return a.isRunnerUp ? -1 : 1;
      const roundDiff = (b.eliminatedRound || 0) - (a.eliminatedRound || 0);
      if (roundDiff !== 0) return roundDiff;
      const winsDiff = b.wins - a.wins;
      if (winsDiff !== 0) return winsDiff;
      return a.teamName.localeCompare(b.teamName);
    })
    .map(({ teamId, isChampion, isRunnerUp, ...entry }, i) => ({ ...entry, finalRank: i + 1 }));

  // Alongside the human-readable fields above, also carry the graph data
  // (id, status, team/winner/loser ids, source pointers) that
  // bracketDiagram()/teamRecords() need — this is what lets a saved file be
  // re-rendered later in the same graphical format the champion screen
  // shows live, via buildHistoricalBracketState() in util.js. Local to this
  // file only; not stable across separate uploads.
  const matches = allMatches.map((m) => ({
    id: m.id,
    bracket: m.bracket,
    round: m.round,
    status: m.status,
    teamA: m.teamAId == null ? null : teamLabel(state, m.teamAId),
    teamB: m.teamBId == null ? null : teamLabel(state, m.teamBId),
    winner: m.winnerId == null ? null : teamLabel(state, m.winnerId),
    isBye: m.isBye,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    winnerId: m.winnerId,
    loserId: m.loserId,
    teamASource: m.teamASource,
    teamBSource: m.teamBSource,
  }));

  const championTeam = state.teams.find((tm) => tm.id === state.championTeamId);
  const runnerUpTeam = state.teams.find((tm) => tm.id === runnerUpId);

  return {
    schemaVersion: 2,
    date: state.createdAt,
    completedAt: state.updatedAt,
    playerCount: state.players.length,
    teamsMode: state.teamsMode,
    boardNames: state.boardNames,
    champion: { teamName: teamLabel(state, state.championTeamId), players: championTeam ? playerNames(state, championTeam) : [] },
    runnerUp: { teamName: teamLabel(state, runnerUpId), players: runnerUpTeam ? playerNames(state, runnerUpTeam) : [] },
    standings,
    teams: state.teams.map((tm) => ({ id: tm.id, name: tm.name })),
    matches,
  };
}

export function exportJSON(state) {
  downloadBlob(JSON.stringify(buildResultsSummary(state), null, 2), "darts-tournament-results.json", "application/json");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Bracket diagram rendering ----
// Each bracket section is laid out at export time: one column per round,
// match cards positioned so a match sits vertically centered between its
// feeder matches, with SVG elbow connectors following the teamASource /
// teamBSource pointers (same-bracket sources only — losers-bracket slots fed
// from the winners bracket arrive "from outside" and get no line).
const BD = { cardW: 190, cardH: 56, colGap: 44, rowGap: 16, headerH: 30 };

function teamSlot(state, records, m, teamId) {
  const isWinner = m.status === "complete" && m.winnerId === teamId;
  const cls = m.status === "complete" ? (isWinner ? "bd-team win" : "bd-team lose") : "bd-team";
  const name = escapeHtml(teamLabel(state, teamId));
  const r = teamId != null ? records[teamId] || { wins: 0, losses: 0 } : null;
  const rec = r ? `<span class="bd-rec">${r.wins}:${r.losses}</span>` : "";
  return `<div class="${cls}"><span class="bd-name">${name}</span>${rec}</div>`;
}

function matchCard(state, records, m, style) {
  let slots;
  if (m.isBye) {
    const knownId = m.teamAId != null ? m.teamAId : m.teamBId;
    slots = teamSlot(state, records, m, knownId) + `<div class="bd-team bye">${t("bye")}</div>`;
  } else {
    slots = teamSlot(state, records, m, m.teamAId) + teamSlot(state, records, m, m.teamBId);
  }
  return `<div class="bd-match"${style ? ` style="${style}"` : ""}>${slots}</div>`;
}

function layoutBracket(matches) {
  const roundNums = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const pos = new Map();
  roundNums.forEach((r, col) => {
    const x = col * (BD.cardW + BD.colGap);
    let cursor = BD.headerH;
    for (const m of matches.filter((match) => match.round === r)) {
      // Center on same-bracket feeder matches when they exist; slots fed from
      // the other bracket just stack below the previous card in the column.
      const srcCenters = [m.teamASource, m.teamBSource]
        .filter((s) => s && pos.has(s.matchId))
        .map((s) => pos.get(s.matchId).y + BD.cardH / 2);
      let y = srcCenters.length
        ? srcCenters.reduce((a, b) => a + b, 0) / srcCenters.length - BD.cardH / 2
        : cursor;
      y = Math.max(y, cursor);
      pos.set(m.id, { x, y });
      cursor = y + BD.cardH + BD.rowGap;
    }
  });
  const width = roundNums.length * (BD.cardW + BD.colGap) - BD.colGap;
  const height = Math.max(...[...pos.values()].map((p) => p.y)) + BD.cardH + 8;
  return { pos, roundNums, width, height };
}

export function bracketDiagram(matches, state, records) {
  if (matches.length === 0) return "";
  const { pos, roundNums, width, height } = layoutBracket(matches);

  const paths = [];
  for (const m of matches) {
    const p = pos.get(m.id);
    for (const s of [m.teamASource, m.teamBSource]) {
      if (!s || !pos.has(s.matchId)) continue;
      const sp = pos.get(s.matchId);
      const x1 = sp.x + BD.cardW;
      const y1 = sp.y + BD.cardH / 2;
      const y2 = p.y + BD.cardH / 2;
      const midX = x1 + BD.colGap / 2;
      paths.push(`<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${p.x}"/>`);
    }
  }

  const headers = roundNums
    .map((r, col) => `<div class="bd-round" style="left:${col * (BD.cardW + BD.colGap)}px">${t("roundLabel", { n: r })}</div>`)
    .join("");
  const cards = matches
    .map((m) => matchCard(state, records, m, `left:${pos.get(m.id).x}px;top:${pos.get(m.id).y}px`))
    .join("");

  return `<div class="bd-scroll"><div class="bd-canvas" style="width:${width}px;height:${height}px">
<svg width="${width}" height="${height}" aria-hidden="true">${paths.join("")}</svg>
${headers}${cards}
</div></div>`;
}

export function grandFinalSection(state, records) {
  const gf1 = state.matches[state.grandFinal.game1MatchId];
  const gf2 = state.matches[state.grandFinal.resetMatchId];
  const items = [{ m: gf1, caption: t("game1") }];
  if (gf2.status === "complete") items.push({ m: gf2, caption: t("bracketResetCaption") });
  const cards = items
    .map(({ m, caption }) => `<div class="bd-gf-item"><div class="bd-round">${caption}</div>${matchCard(state, records, m, "")}</div>`)
    .join("");
  return `<div class="bd-gf">${cards}</div>`;
}

export function exportHTML(state) {
  const runnerUpId = getRunnerUpId(state);

  const championName = escapeHtml(teamLabel(state, state.championTeamId));
  const runnerUpName = escapeHtml(teamLabel(state, runnerUpId));

  const records = teamRecords(state.matches);
  const teamsRows = state.teams
    .map((team) => {
      const names = team.playerIds
        .map((id) => escapeHtml(state.players.find((p) => p.id === id)?.name || "?"))
        .join(" & ");
      const r = records[team.id] || { wins: 0, losses: 0 };
      return `<tr><td>${escapeHtml(team.name)}</td><td>${names}</td><td>${r.wins}:${r.losses}</td></tr>`;
    })
    .join("");

  const allMatches = state.matchOrder.map((id) => state.matches[id]);
  const wb = allMatches.filter((m) => m.bracket === "winners");
  const lb = allMatches.filter((m) => m.bracket === "losers");

  const html = `<!DOCTYPE html>
<html lang="${getLanguage()}">
<head>
<meta charset="UTF-8">
<title>${t("tournamentResultsTitle")}</title>
<style>
body{font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px;max-width:960px;margin:0 auto;}
h1{color:#2e9e5b;}
table{width:100%;border-collapse:collapse;margin-bottom:24px;}
th,td{border:1px solid #444;padding:8px;text-align:left;}
th{background:#222;}
.banner{background:#1c1c1c;border:1px solid #2e9e5b;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;}
.bd-scroll{overflow-x:auto;padding-bottom:8px;margin-bottom:24px;}
.bd-canvas{position:relative;}
.bd-canvas svg{position:absolute;top:0;left:0;}
.bd-canvas path{stroke:#444;stroke-width:2;fill:none;}
.bd-round{color:#8a8a8a;font-size:12px;text-transform:uppercase;letter-spacing:.05em;}
.bd-canvas .bd-round{position:absolute;top:0;width:${BD.cardW}px;}
.bd-canvas .bd-match{position:absolute;}
.bd-match{width:${BD.cardW}px;height:${BD.cardH}px;box-sizing:border-box;background:#1c1c1c;border:1px solid #333;border-radius:6px;overflow:hidden;display:flex;flex-direction:column;}
.bd-team{flex:1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px;font-size:13px;border-left:3px solid transparent;min-width:0;}
.bd-team + .bd-team{border-top:1px solid #2a2a2a;}
.bd-team.win{border-left-color:#2e9e5b;font-weight:bold;}
.bd-team.win .bd-name::after{content:" \\2713";color:#2e9e5b;}
.bd-team.lose .bd-name{color:#999;}
.bd-team.bye{color:#777;font-style:italic;}
.bd-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bd-rec{color:#8a8a8a;font-size:11px;font-variant-numeric:tabular-nums;flex-shrink:0;}
.bd-gf{display:flex;gap:24px;flex-wrap:wrap;margin-bottom:24px;}
.bd-gf-item .bd-round{margin-bottom:6px;}
</style>
</head>
<body>
<h1>${t("tournamentResultsTitle")}</h1>
<div class="banner">
  <p>&#127942; ${t("championLabel")} <strong>${championName}</strong></p>
  <p>${t("runnerUpLabel")} ${runnerUpName}</p>
</div>
<h2>${t("teamsHeading")}</h2>
<table><thead><tr><th>${t("teamHeader")}</th><th>${t("playersHeader")}</th><th>${t("recordHeader")}</th></tr></thead><tbody>${teamsRows}</tbody></table>
<h2>${t("winnersBracket")}</h2>
${bracketDiagram(wb, state, records)}
<h2>${t("losersBracket")}</h2>
${bracketDiagram(lb, state, records)}
<h2>${t("grandFinal")}</h2>
${grandFinalSection(state, records)}
<p>${t("generatedOn", { date: new Date().toLocaleString(getLanguage() === "es" ? "es-ES" : "en-US") })}</p>
</body>
</html>`;

  downloadBlob(html, "darts-tournament-results.html", "text/html");
}
