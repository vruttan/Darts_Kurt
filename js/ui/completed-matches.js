// Completed-match card + panel, shared between the live match view and the
// champion screen (correcting the deciding grand final match has to work
// even after a champion has already been crowned).
//
// Tapping the losing team on a completed card previews the edit via
// app.previewEditResult(), then confirms via showConfirm() — with a plain
// confirmation if nothing downstream was affected, or a warning listing
// every match that would be reopened if the edit ripples forward.

import { el, showConfirm } from "./render.js";
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

function bracketLabel(bracket) {
  switch (bracket) {
    case "winners":
      return t("winnersBracket");
    case "losers":
      return t("losersBracket");
    case "grandfinal":
      return t("grandFinal");
    case "grandfinal-reset":
      return t("grandFinalReset");
    default:
      return bracket;
  }
}

function matchContextLabel(m) {
  const label = bracketLabel(m.bracket);
  return m.bracket === "grandfinal" || m.bracket === "grandfinal-reset" ? label : `${label} — ${t("roundLabel", { n: m.round })}`;
}

function handleEditTap(state, app, match, otherTeamId) {
  const reopenedMatchIds = app.previewEditResult(match.id, otherTeamId);
  const name = teamLabel(state, otherTeamId);

  if (reopenedMatchIds.length === 0) {
    showConfirm(t("confirmEditResult", { name }), () => app.editResult(match.id, otherTeamId));
    return;
  }

  const lines = [t("editResultWarningHeadline", { name, count: reopenedMatchIds.length })];
  for (const id of reopenedMatchIds) {
    const m = state.matches[id];
    lines.push(
      t("editResultWarningLine", {
        context: matchContextLabel(m),
        teamA: teamLabel(state, m.teamAId),
        teamB: teamLabel(state, m.teamBId),
      })
    );
  }
  showConfirm(lines, () => app.editResult(match.id, otherTeamId));
}

export function renderCompletedCard(state, records, app, m) {
  const aName = teamDisplay(state, records, m.teamAId);
  const bName = teamDisplay(state, records, m.teamBId);
  const aIsWinner = m.winnerId === m.teamAId;

  return el("div", { class: "board-card complete" }, [
    el("div", { class: "board-label", text: matchContextLabel(m) }),
    el("button", {
      class: `team-tap ${aIsWinner ? "winner" : "loser editable"}`,
      text: aName,
      disabled: aIsWinner || undefined,
      onclick: aIsWinner ? undefined : () => handleEditTap(state, app, m, m.teamAId),
    }),
    el("div", { class: "vs", text: t("vs") }),
    el("button", {
      class: `team-tap ${!aIsWinner ? "winner" : "loser editable"}`,
      text: bName,
      disabled: !aIsWinner || undefined,
      onclick: !aIsWinner ? undefined : () => handleEditTap(state, app, m, m.teamBId),
    }),
    el("p", { class: "completed-hint", text: t("editResultHint") }),
  ]);
}

export function renderCompletedPanel(state, records, app, matches) {
  if (matches.length === 0) return null;
  return el("div", { class: "panel" }, [
    el("h2", { text: t("completedMatches") }),
    el("div", { class: "board-grid" }, matches.map((m) => renderCompletedCard(state, records, app, m))),
  ]);
}
