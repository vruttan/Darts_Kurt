// Entry point: wires state, players, boards, and the view modules together.

import * as Store from "./state.js";
import * as Players from "./players.js";
import { recordResult, simulateEditResult, editResult } from "./boards.js";
import * as I18n from "./i18n.js";
import * as Github from "./github.js";
import { buildResultsSummary } from "./export.js";
import { renderSetupNames, renderManualPairing, renderTeamConfirm, renderBoardCount } from "./ui/setup-view.js";
import { renderMatchView } from "./ui/match-view.js";
import { renderChampionView } from "./ui/champion-view.js";

const root = document.getElementById("app");

let state = Store.load() || Store.createInitialState();
let swRegistration = null;

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
      if (!state.resultsUpload && Github.hasConfig(Github.loadConfig())) {
        setTimeout(() => app.saveResultsToGithub(), 0);
      }
      break;
    case "setup":
    default:
      renderSetupNames(root, state, app);
  }
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

render();
wireLanguageToggle();

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
