// Champion screen: winner/runner-up banner + expanded brackets + start-over action.

import { el, mount, showConfirm, renderDiagramSection } from "./render.js";
import { teamRecords } from "../util.js";
import { bracketDiagram, exportJSON, getRunnerUpId } from "../export.js";
import { renderCompletedPanel } from "./completed-matches.js";
import { renderGithubConfigForm } from "./github-config-form.js";
import * as Github from "../github.js";
import { t } from "../i18n.js";

function teamLabel(state, id) {
  const team = state.teams.find((tm) => tm.id === id);
  return team ? team.name : t("tbd");
}

// Purely transient "which view of the GitHub panel is showing" flag — not
// tournament data, so it doesn't belong in `state`. Lives at module scope
// (rather than being reset on every re-render) and is toggled directly by
// re-invoking renderChampionView, since this module already has `root`,
// `state`, and `app` in scope wherever that toggle happens.
let configFormVisible = false;

function uploadErrorKey(kind) {
  switch (kind) {
    case "network":
      return "uploadErrorNetwork";
    case "auth":
      return "uploadErrorAuth";
    case "notfound":
      return "uploadErrorNotFound";
    case "conflict":
      return "uploadErrorConflict";
    default:
      return "uploadErrorGeneric";
  }
}

function renderGithubStatusPanel(root, state, app, config) {
  const upload = state.resultsUpload || { status: "idle", error: null };
  const uploading = upload.status === "uploading";

  let statusLine = null;
  if (uploading) {
    statusLine = el("p", { class: "waiting-strip", text: t("uploadStatusUploading") });
  } else if (upload.status === "success") {
    statusLine = el("p", { class: "waiting-strip", text: t("uploadStatusSuccess") });
  } else if (upload.status === "error") {
    statusLine = el("p", { class: "waiting-strip error", text: t(uploadErrorKey(upload.error), { status: upload.error }) });
  }

  return el("div", { class: "panel" }, [
    el("div", { class: "row team-card" }, [
      el("span", { text: t("githubConnectedTo", { owner: config.owner, repo: config.repo }) }),
      el("button", {
        class: "link",
        text: t("changeGithubConfig"),
        onclick: () => {
          configFormVisible = true;
          renderChampionView(root, state, app);
        },
      }),
    ]),
    statusLine,
    el("div", { class: "actions" }, [
      el("button", {
        class: "primary",
        text: upload.status === "error" ? t("retryUpload") : t("saveResultsToGithub"),
        disabled: uploading,
        onclick: () => app.saveResultsToGithub(),
      }),
    ]),
  ]);
}

function renderGithubSection(root, state, app) {
  const config = Github.loadConfig();
  return Github.hasConfig(config) && !configFormVisible
    ? renderGithubStatusPanel(root, state, app, config)
    : renderGithubConfigForm(root, state, app, config, (fields) => {
        configFormVisible = false;
        app.saveGithubConfig(fields);
      });
}

export function renderChampionView(root, state, app) {
  const runnerUpId = getRunnerUpId(state);

  const records = teamRecords(state.matches);
  const allMatches = state.matchOrder.map((id) => state.matches[id]);
  const wbMatches = allMatches.filter((m) => m.bracket === "winners");
  const lbMatches = allMatches.filter((m) => m.bracket === "losers");

  const completedMatches = (state.completedMatchIds || [])
    .slice()
    .reverse()
    .map((id) => state.matches[id])
    .filter(Boolean);

  const screen = el("div", { class: "screen" }, [
    el("div", { class: "champion-banner" }, [
      el("div", { class: "trophy", text: "🏆" }),
      el("h2", { text: teamLabel(state, state.championTeamId) }),
      el("p", { text: `${t("runnerUpLabel")} ${teamLabel(state, runnerUpId)}` }),
    ]),
    el("div", { class: "actions" }, [
      // Hidden for now; re-enable by uncommenting to restore the JSON export button.
      // el("button", { class: "secondary", text: t("downloadJsonData"), onclick: () => exportJSON(state) }),
      el("button", {
        class: "danger",
        text: t("startNewTournament"),
        onclick: () => {
          showConfirm(t("confirmNewTournament"), () => app.startNewTournament());
        },
      }),
    ]),
    renderDiagramSection(t("winnersBracket"), bracketDiagram(wbMatches, state, records)),
    renderDiagramSection(t("losersBracket"), bracketDiagram(lbMatches, state, records)),
    renderCompletedPanel(state, records, app, completedMatches),
    renderGithubSection(root, state, app),
  ]);

  mount(root, screen);
}
