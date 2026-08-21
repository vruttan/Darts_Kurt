// Entry point: wires state, players, boards, and the view modules together.

import * as Store from "./state.js";
import * as Players from "./players.js";
import { recordResult, simulateEditResult, editResult } from "./boards.js";
import * as I18n from "./i18n.js";
import * as Github from "./github.js";
import * as Registration from "./registration.js";
import { buildResultsSummary } from "./export.js";
import { renderSetupNames, renderManualPairing, renderTeamConfirm, renderBoardCount } from "./ui/setup-view.js";
import { renderMatchView } from "./ui/match-view.js";
import { renderChampionView } from "./ui/champion-view.js";
import { renderHistoryList, renderHistoryDetail } from "./ui/history-view.js";

const root = document.getElementById("app");

let state = Store.load() || Store.createInitialState();
let swRegistration = null;

// Transient "browsing past GitHub results" UI state — not tournament data,
// so (like champion-view.js's configFormVisible) it deliberately lives
// outside `state` rather than as a new state.phase: it's non-resumable,
// network-fetched browse state unrelated to the persisted, schema-versioned
// tournament phase machine, and should never survive a reload or interfere
// with it.
// { mode: "list", status: "loading"|"loaded"|"error", error, files }
// { mode: "detail", file, status: "loading"|"loaded"|"error", error, summary }
let historyView = null;

function persistAndRender() {
  Store.save(state);
  render();
}

const app = {
  addPlayer(name) {
    Players.addPlayer(state, name);
    persistAndRender();
  },
  removePlayer(id) {
    Players.removePlayer(state, id);
    persistAndRender();
  },
  goToTeams() {
    Players.generateTeams(state);
    state.teamsMode = "random";
    state.phase = "teams";
    persistAndRender();
  },
  reshuffleTeams() {
    Players.generateTeams(state);
    persistAndRender();
  },
  goToManualTeams() {
    Players.startManualPairing(state);
    state.teamsMode = "manual";
    state.phase = "teams";
    persistAndRender();
  },
  selectManualPlayer(playerId) {
    Players.selectManualPlayer(state, playerId);
    persistAndRender();
  },
  undoManualTeam(teamId) {
    Players.undoManualTeam(state, teamId);
    persistAndRender();
  },
  editManualPairing() {
    Players.startManualPairing(state);
    persistAndRender();
  },
  swapSitOut(playerId) {
    Players.setSitOutPlayer(state, playerId);
    persistAndRender();
  },
  confirmTeams() {
    state.phase = "boards";
    persistAndRender();
  },
  addBoardName(name) {
    Store.addBoardName(state, name);
    persistAndRender();
  },
  removeBoardName(index) {
    Store.removeBoardName(state, index);
    persistAndRender();
  },
  startTournament() {
    Store.startTournament(state);
    persistAndRender();
  },
  recordResult(matchId, winnerId) {
    recordResult(state, matchId, winnerId);
    persistAndRender();
  },
  previewEditResult(matchId, newWinnerId) {
    return simulateEditResult(state, matchId, newWinnerId).reopenedMatchIds;
  },
  editResult(matchId, newWinnerId) {
    editResult(state, matchId, newWinnerId);
    persistAndRender();
  },
  startNewTournament() {
    state = Store.resetTournament();
    persistAndRender();
  },
  backToSetup() {
    state.phase = "setup";
    persistAndRender();
  },
  backToTeams() {
    state.phase = "teams";
    persistAndRender();
  },
  saveResultsToGithub() {
    const config = Github.loadConfig();
    const summary = buildResultsSummary(state);
    const path = (state.resultsUpload && state.resultsUpload.path) || Github.resultsPath(config, summary);
    state.resultsUpload = { status: "uploading", error: null, path, uploadedAt: null };
    persistAndRender();
    Github.uploadResults(config, summary, path).then((result) => {
      state.resultsUpload = result.ok
        ? { status: "success", error: null, path, uploadedAt: new Date().toISOString() }
        : { status: "error", error: result.kind, path, uploadedAt: null };
      persistAndRender();
    });
  },
  saveGithubConfig(fields) {
    Github.saveConfig(fields);
    app.saveResultsToGithub();
  },
  openHistory() {
    historyView = { mode: "list", status: "loading", error: null, files: null };
    render();
    Github.listResults(Github.loadConfig()).then((result) => {
      if (!historyView || historyView.mode !== "list") return; // user navigated away
      historyView = result.ok
        ? { mode: "list", status: "loaded", error: null, files: result.files }
        : { mode: "list", status: "error", error: result.kind, files: null };
      render();
    });
  },
  closeHistory() {
    historyView = null;
    render();
  },
  selectHistoryFile(file) {
    historyView = { mode: "detail", file, status: "loading", error: null, summary: null };
    render();
    Github.fetchResult(Github.loadConfig(), file.path).then((result) => {
      if (!historyView || historyView.mode !== "detail" || historyView.file !== file) return;
      historyView = result.ok
        ? { mode: "detail", file, status: "loaded", error: null, summary: result.summary }
        : { mode: "detail", file, status: "error", error: result.kind, summary: null };
      render();
    });
  },
  saveGithubConfigForHistory(fields) {
    Github.saveConfig(fields);
    app.openHistory();
  },
  // Manually forces the same update check the app already runs on its own
  // whenever the tab regains focus (see the service worker registration
  // below) — for someone who wants to confirm right now rather than wait.
  // Doesn't touch `state`: if a new version is found, it self-activates and
  // the controllerchange listener below reloads the page automatically.
  async checkForUpdate() {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const registration = swRegistration || (await navigator.serviceWorker.getRegistration());
    if (!registration) return "unsupported";
    try {
      await registration.update();
    } catch {
      return "offline";
    }
    return registration.installing || registration.waiting ? "updating" : "up-to-date";
  },
};

function render() {
  if (historyView) {
    if (historyView.mode === "list") renderHistoryList(root, state, app, historyView);
    else renderHistoryDetail(root, state, app, historyView);
    return;
  }
  switch (state.phase) {
    case "teams":
      if (state.teamsMode === "manual" && !Players.isManualPairingComplete(state)) {
        renderManualPairing(root, state, app);
      } else {
        renderTeamConfirm(root, state, app);
      }
      break;
    case "boards":
      renderBoardCount(root, state, app);
      break;
    case "live":
      renderMatchView(root, state, app);
      break;
    case "complete":
      renderChampionView(root, state, app);
      // Auto-attempt exactly once per completed tournament, deferred to the
      // next tick so it doesn't re-enter persistAndRender()/render() (and
      // thus this same renderChampionView() call) before this one returns.
      // Skipped silently (no error shown, champion view renders as normal)
      // when the run is flagged "Unregistered", there's no connectivity, or
      // no token has been configured yet — the manual "Save Results to
      // GitHub" button in the champion view still covers those cases.
      if (
        !state.resultsUpload &&
        !Registration.isUnregistered() &&
        navigator.onLine &&
        Github.hasConfig(Github.loadConfig())
      ) {
        setTimeout(() => app.saveResultsToGithub(), 0);
      }
      break;
    case "setup":
    default:
      renderSetupNames(root, state, app);
  }
}

const regToggleBtn = document.getElementById("registration-toggle");

function updateRegistrationButton() {
  const active = Registration.isUnregistered();
  regToggleBtn.textContent = I18n.t("unregisteredToggle");
  regToggleBtn.classList.toggle("active", active);
  regToggleBtn.setAttribute("aria-pressed", String(active));
}

function wireLanguageToggle() {
  const enBtn = document.getElementById("lang-en");
  const esBtn = document.getElementById("lang-es");

  function updateButtons() {
    const lang = I18n.getLanguage();
    document.documentElement.lang = lang;
    enBtn.classList.toggle("active", lang === "en");
    esBtn.classList.toggle("active", lang === "es");
    enBtn.setAttribute("aria-pressed", String(lang === "en"));
    esBtn.setAttribute("aria-pressed", String(lang === "es"));
    updateRegistrationButton();
  }

  enBtn.addEventListener("click", () => {
    I18n.setLanguage("en");
    updateButtons();
    render();
  });
  esBtn.addEventListener("click", () => {
    I18n.setLanguage("es");
    updateButtons();
    render();
  });

  updateButtons();
}

function wireRegistrationToggle() {
  regToggleBtn.addEventListener("click", () => {
    Registration.setUnregistered(!Registration.isUnregistered());
    updateRegistrationButton();
  });
  updateRegistrationButton();
}

render();
wireLanguageToggle();
wireRegistrationToggle();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => {
        swRegistration = registration;

        // The SW self-activates new versions immediately (skipWaiting +
        // clients.claim), but an already-open tab keeps running the JS it
        // already loaded until it reloads. Reload once, automatically, the
        // moment a new version takes over — this is the only way to pick up
        // an update on Android, where there's no hard-refresh gesture.
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });

        // Browsers only re-check service-worker.js for changes on
        // navigation (and even then, at most once a day by spec). A
        // dart tournament can keep this tab open for hours, so also check
        // whenever the tab regains focus — that's when a stale version is
        // most likely to matter.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update();
        });
      })
      .catch(() => {
        // Offline install just won't be available; the app still works online.
      });
  });
}
