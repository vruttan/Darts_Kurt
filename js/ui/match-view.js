// Live match queue screen: one card per board, tap a team name to record the
// winner, plus collapsible graphical bracket diagrams (same rendering as the
// HTML export) for both brackets and the grand final.

import { el, mount, showConfirm } from "./render.js";
import { teamRecords } from "../util.js";
import { exportHTML, bracketDiagram, grandFinalSection } from "../export.js";
import { renderCompletedPanel } from "./completed-matches.js";
import { t } from "../i18n.js";

function teamLabel(state, teamId) {
  if (teamId == null) return t("tbd");
  const team = state.teams.find((tm) => tm.id === teamId);
  return team ? team.name : t("tbd");
}

function teamDisplay(state, records, teamId) {
  if (teamId == null) return t("tbd");
  const r = records[teamId] || { wins: 0, losses: 0 };
  return `${teamLabel(state, teamId)} (${r.wins}:${r.losses})`;
}

function renderDiagramSection(title, html, openByDefault) {
  if (!html) return null;
  return el("details", { class: "bracket-section", open: openByDefault }, [
    el("summary", { text: title }),
    el("div", { class: "bd-wrap", html }),
  ]);
}

function renderBoardCard(state, records, app, board) {
  if (!board.matchId) {
    return el("div", { class: "board-card idle" }, [
      el("div", { class: "board-label", text: board.name }),
      el("p", { text: t("waitingForNextMatch") }),
    ]);
  }

  const match = state.matches[board.matchId];
  const labelPrefix =
    match.bracket === "grandfinal" ? `${t("grandFinal")} — ` : match.bracket === "grandfinal-reset" ? `${t("grandFinalReset")} — ` : "";
  const aName = teamDisplay(state, records, match.teamAId);
  const bName = teamDisplay(state, records, match.teamBId);

  function pickWinner(teamId) {
    showConfirm(t("confirmWinner", { name: teamLabel(state, teamId) }), () => app.recordResult(match.id, teamId));
  }

  return el("div", { class: "board-card" }, [
    el("div", { class: "board-label", text: `${labelPrefix}${board.name}` }),
    el("button", { class: "team-tap", text: aName, onclick: () => pickWinner(match.teamAId) }),
    el("div", { class: "vs", text: t("vs") }),
    el("button", { class: "team-tap", text: bName, onclick: () => pickWinner(match.teamBId) }),
    match.bracket === "grandfinal-reset"
      ? el("p", { class: "waiting-strip", text: t("bracketResetNotice") })
      : null,
  ]);
}

export function renderMatchView(root, state, app) {
  const records = teamRecords(state.matches);
  const boardsGrid = el(
    "div",
    { class: "board-grid" },
    state.boards.map((board) => renderBoardCard(state, records, app, board))
  );

  const allMatches = state.matchOrder.map((id) => state.matches[id]);
  const grandFinalMatches = allMatches.filter((m) => m.bracket === "grandfinal" || m.bracket === "grandfinal-reset");
  const wbMatches = allMatches.filter((m) => m.bracket === "winners");
  const lbMatches = allMatches.filter((m) => m.bracket === "losers");
  const waitingCount = allMatches.filter((m) => m.status === "ready").length;

  const completedMatches = (state.completedMatchIds || [])
    .slice()
    .reverse()
    .map((id) => state.matches[id])
    .filter(Boolean);

  const liveLeft = el("div", { class: "live-left" }, [
    boardsGrid,
    waitingCount > 0
      ? el("p", { class: "waiting-strip", text: t("matchesWaiting", { count: waitingCount }) })
      : null,
  ]);

  const liveRight = el("div", { class: "live-right" }, [
    renderDiagramSection(t("winnersBracket"), bracketDiagram(wbMatches, state, records), true),
    renderDiagramSection(t("losersBracket"), bracketDiagram(lbMatches, state, records), true),
    grandFinalMatches.length > 0
      ? renderDiagramSection(t("grandFinal"), grandFinalSection(state, records), true)
      : null,
  ]);

  const screen = el("div", { class: "screen live-screen" }, [
    el("h1", { text: t("liveMatches") }),
    el("div", { class: "live-layout" }, [liveLeft, liveRight]),
    renderCompletedPanel(state, records, app, completedMatches),
    el("div", { class: "actions" }, [
      el("button", { text: t("downloadHtmlReport"), onclick: () => exportHTML(state) }),
    ]),
  ]);

  mount(root, screen);
}
