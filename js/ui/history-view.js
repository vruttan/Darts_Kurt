// Browse tournament results previously uploaded to GitHub: a list screen
// (renderHistoryList) and a read-only detail screen (renderHistoryDetail)
// that reuses the exact same bracket diagram renderer champion-view.js
// uses live, via buildHistoricalBracketState() (util.js).

import { el, mount, renderDiagramSection } from "./render.js";
import { renderGithubConfigForm } from "./github-config-form.js";
import * as Github from "../github.js";
import { bracketDiagram } from "../export.js";
import { hasDiagramData, buildHistoricalBracketState } from "../util.js";
import { t } from "../i18n.js";

function historyErrorKey(kind) {
  switch (kind) {
    case "network":
      return "historyErrorNetwork";
    case "auth":
      return "historyErrorAuth";
    case "notfound":
      return "historyErrorNotFound";
    default:
      return "historyErrorGeneric";
  }
}

// Filenames are the date slugs resultsPath() (github.js) generates: an ISO
// timestamp with `:`/`.` swapped for `-`, e.g.
// "2026-08-20T14-30-00-000Z.json". Turn that back into a readable local
// date/time; fall back to the raw filename for anything that doesn't match
// (a file uploaded some other way, or a future naming change).
function fileLabel(name) {
  const stem = name.replace(/\.json$/, "");
  const match = stem.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) return name;
  const [, ymd, hh, mm, ss, ms] = match;
  const date = new Date(`${ymd}T${hh}:${mm}:${ss}.${ms}Z`);
  return Number.isNaN(date.getTime()) ? name : date.toLocaleString();
}

function backButton(app) {
  return el("button", { class: "link", text: t("backToSetupFromHistory"), onclick: () => app.closeHistory() });
}

export function renderHistoryList(root, state, app, historyView) {
  const config = Github.loadConfig();

  if (!Github.hasConfig(config)) {
    const screen = el("div", { class: "screen" }, [
      el("h1", { text: t("historyListTitle") }),
      renderGithubConfigForm(root, state, app, config, (fields) => app.saveGithubConfigForHistory(fields)),
      el("div", { class: "actions" }, [backButton(app)]),
    ]);
    mount(root, screen);
    return;
  }

  let body;
  if (historyView.status === "loading") {
    body = el("p", { class: "waiting-strip", text: t("historyLoading") });
  } else if (historyView.status === "error") {
    body = el("div", {}, [
      el("p", { class: "waiting-strip error", text: t(historyErrorKey(historyView.error)) }),
      el("div", { class: "actions" }, [
        el("button", { class: "primary", text: t("retryUpload"), onclick: () => app.openHistory() }),
      ]),
    ]);
  } else if (historyView.files.length === 0) {
    body = el("p", { class: "waiting-strip", text: t("historyEmpty") });
  } else {
    body = el(
      "div",
      { class: "chip-list", style: "flex-direction:column;align-items:stretch;" },
      historyView.files.map((file) =>
        el("button", { class: "team-card row", text: fileLabel(file.name), onclick: () => app.selectHistoryFile(file) })
      )
    );
  }

  const screen = el("div", { class: "screen" }, [
    el("h1", { text: t("historyListTitle") }),
    el("div", { class: "panel" }, [body]),
    el("div", { class: "actions" }, [backButton(app)]),
  ]);
  mount(root, screen);
}

function standingsRow(entry) {
  return el("div", { class: "team-card row" }, [
    el("span", { text: `${t("finalRankHeader")}${entry.finalRank} — ${entry.teamName}` }),
    el("span", { text: `${entry.wins}:${entry.losses}` }),
  ]);
}

function renderSummaryBody(summary) {
  const standings = el(
    "div",
    { class: "panel" },
    [
      el("h2", { text: t("standingsHeading") }),
      el(
        "div",
        { class: "chip-list", style: "flex-direction:column;align-items:stretch;" },
        summary.standings.map(standingsRow)
      ),
    ]
  );

  if (!hasDiagramData(summary)) {
    return [
      el("p", { class: "waiting-strip", text: t("historyDiagramUnavailable") }),
      standings,
    ];
  }

  const { state: bState, records, wbMatches, lbMatches } = buildHistoricalBracketState(summary);
  return [
    standings,
    renderDiagramSection(t("winnersBracket"), bracketDiagram(wbMatches, bState, records)),
    renderDiagramSection(t("losersBracket"), bracketDiagram(lbMatches, bState, records)),
  ];
}

export function renderHistoryDetail(root, state, app, historyView) {
  let body;
  if (historyView.status === "loading") {
    body = [el("p", { class: "waiting-strip", text: t("historyLoading") })];
  } else if (historyView.status === "error") {
    body = [
      el("p", { class: "waiting-strip error", text: t(historyErrorKey(historyView.error)) }),
      el("div", { class: "actions" }, [
        el("button", {
          class: "primary",
          text: t("retryUpload"),
          onclick: () => app.selectHistoryFile(historyView.file),
        }),
      ]),
    ];
  } else {
    const summary = historyView.summary;
    body = [
      el("div", { class: "champion-banner" }, [
        el("div", { class: "trophy", text: "🏆" }),
        el("h2", { text: summary.champion.teamName }),
        el("p", { text: `${t("runnerUpLabel")} ${summary.runnerUp.teamName}` }),
      ]),
      ...renderSummaryBody(summary),
    ];
  }

  const screen = el("div", { class: "screen" }, [
    el("h1", { text: fileLabel(historyView.file.name) }),
    ...body,
    el("div", { class: "actions" }, [
      el("button", { class: "link", text: t("backToResultsList"), onclick: () => app.openHistory() }),
      backButton(app),
    ]),
  ]);
  mount(root, screen);
}
