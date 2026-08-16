// Setup phase screens: name entry -> team confirmation -> board count.

import { el, mount } from "./render.js";
import { t } from "../i18n.js";

const MIN_PLAYERS = 4;

export function renderSetupNames(root, state, app) {
  const input = el("input", { type: "text", placeholder: t("playerNamePlaceholder"), id: "player-name-input" });

  function submit() {
    if (input.value.trim()) {
      app.addPlayer(input.value);
      input.value = "";
      input.focus();
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  const chips = el(
    "div",
    { class: "chip-list" },
    state.players.map((p) =>
      el("span", { class: "chip" }, [
        p.name,
        el("button", { text: "×", onclick: () => app.removePlayer(p.id) }),
      ])
    )
  );

  const remaining = Math.max(0, MIN_PLAYERS - state.players.length);

  const updateStatus = el("p", { class: "waiting-strip" });
  const updateButton = el("button", {
    text: t("getLatestVersion"),
    onclick: async () => {
      updateButton.disabled = true;
      updateStatus.textContent = t("checkingForUpdate");
      const result = await app.checkForUpdate();
      switch (result) {
        case "updating":
          // The new version self-activates and the page reloads on its own
          // shortly; leave the button disabled so it isn't tapped again.
          updateStatus.textContent = t("updatingNotice");
          break;
        case "up-to-date":
          updateStatus.textContent = t("upToDate");
          updateButton.disabled = false;
          break;
        default:
          updateStatus.textContent = t("updateCheckFailed");
          updateButton.disabled = false;
      }
    },
  });

  const screen = el("div", { class: "screen" }, [
    el("p", { class: "subtitle", text: t("setupSubtitle") }),
    el("div", { class: "panel" }, [
      el("div", { class: "row" }, [input, el("button", { class: "primary", text: "+", onclick: submit })]),
      chips,
      el("p", {
        class: "waiting-strip",
        text:
          state.players.length === 0
            ? t("noPlayersYet")
            : remaining > 0
              ? t("playersEnteredRemaining", { count: state.players.length, remaining, min: MIN_PLAYERS })
              : t("playersEntered", { count: state.players.length }),
      }),
    ]),
    el("div", { class: "actions" }, [
      el("button", {
        class: "primary",
        text: t("randomPairing"),
        disabled: state.players.length < MIN_PLAYERS,
        onclick: () => app.goToTeams(),
      }),
      el("button", {
        text: t("manualPairing"),
        disabled: state.players.length < MIN_PLAYERS,
        onclick: () => app.goToManualTeams(),
      }),
      updateButton,
    ]),
    updateStatus,
  ]);

  mount(root, screen);
  input.focus();
}

export function renderManualPairing(root, state, app) {
  const mp = state.manualPairing;

  const unpairedChips = el(
    "div",
    { class: "chip-list" },
    mp.unpairedIds.map((id) => {
      const p = state.players.find((pl) => pl.id === id);
      return el("button", {
        class: `chip-select${mp.selectedId === id ? " selected" : ""}`,
        text: p.name,
        onclick: () => app.selectManualPlayer(id),
      });
    })
  );

  const teamRows = state.teams.map((team) =>
    el("div", { class: "team-card row" }, [
      el("span", { text: team.name }),
      el("button", { class: "link", text: t("undo"), onclick: () => app.undoManualTeam(team.id) }),
    ])
  );

  const helperText =
    mp.unpairedIds.length === 0
      ? t("allPlayersPaired")
      : mp.unpairedIds.length === 1
        ? t("sitOutSingle", { name: state.players.find((p) => p.id === mp.unpairedIds[0]).name })
        : mp.selectedId == null
          ? t("tapPlayerInstruction")
          : t("tapPartner", { name: state.players.find((p) => p.id === mp.selectedId).name });

  const screen = el("div", { class: "screen" }, [
    el("h1", { text: t("manualPairing") }),
    el("p", { class: "subtitle", text: helperText }),
    el("div", { class: "panel" }, [
      el("h2", { text: t("unpairedCount", { count: mp.unpairedIds.length }) }),
      unpairedChips,
    ]),
    state.teams.length > 0
      ? el("div", { class: "panel" }, [
          el("h2", { text: t("teamsFormedCount", { count: state.teams.length }) }),
          el("div", { class: "chip-list", style: "flex-direction:column;align-items:stretch;" }, teamRows),
        ])
      : null,
    el("div", { class: "actions" }, [
      el("button", { class: "link", text: t("backToPlayers"), onclick: () => app.backToSetup() }),
    ]),
  ]);

  mount(root, screen);
}

export function renderTeamConfirm(root, state, app) {
  const sitOut = state.players.find((p) => p.sittingOut);

  const banner = sitOut
    ? el("div", { class: "banner" }, [
      el("p", { text: t("sitsOutTournament", { name: sitOut.name }) }),
      el(
        "select",
        {
          onchange: (e) => {
            if (e.target.value) app.swapSitOut(e.target.value);
          },
        },
        [
          el("option", { value: "", text: t("chooseDifferentSitOut") }),
          ...state.players
            .filter((p) => !p.sittingOut)
            .map((p) => el("option", { value: p.id, text: p.name })),
        ]
      ),
    ])
    : null;

  const teamCards = state.teams.map((team) => el("div", { class: "team-card", text: team.name }));

  const redoButton =
    state.teamsMode === "manual"
      ? el("button", { text: t("editPairing"), onclick: () => app.editManualPairing() })
      : el("button", { text: t("reshuffleTeams"), onclick: () => app.reshuffleTeams() });

  const screen = el("div", { class: "screen" }, [
    el("h1", { text: t("confirmTeamsTitle") }),
    banner,
    el("div", { class: "panel" }, [
      el("h2", { text: t("teamsCount", { count: state.teams.length }) }),
      el("div", { class: "chip-list", style: "flex-direction:column;align-items:stretch;" }, teamCards),
    ]),
    el("div", { class: "actions" }, [
      redoButton,
      el("button", { class: "primary", text: t("confirmTeamsTitle"), onclick: () => app.confirmTeams() }),
      el("button", { class: "link", text: t("backToPlayers"), onclick: () => app.backToSetup() }),
    ]),
  ]);

  mount(root, screen);
}

export function renderBoardCount(root, state, app) {
  const input = el("input", { type: "text", placeholder: t("boardNamePlaceholder"), id: "board-name-input" });

  function submit() {
    if (input.value.trim()) {
      app.addBoardName(input.value);
      input.value = "";
      input.focus();
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  const chips = el(
    "div",
    { class: "chip-list" },
    state.boardNames.map((name, i) =>
      el("span", { class: "chip" }, [
        name,
        el("button", { text: "×", onclick: () => app.removeBoardName(i) }),
      ])
    )
  );

  const screen = el("div", { class: "screen" }, [
    el("h1", { text: t("dartBoardsTitle") }),
    el("p", {
      class: "subtitle",
      text: t("boardsSubtitle"),
    }),
    el("div", { class: "panel" }, [
      el("div", { class: "row" }, [input, el("button", { class: "primary", text: "+", onclick: submit })]),
      chips,
      el("p", {
        class: "waiting-strip",
        text: state.boardNames.length === 0 ? t("noBoardsYet") : t("boardsEntered", { count: state.boardNames.length }),
      }),
    ]),
    el("div", { class: "actions" }, [
      el("button", {
        class: "primary",
        text: t("startTournament"),
        disabled: state.boardNames.length === 0,
        onclick: () => app.startTournament(),
      }),
      el("button", { class: "link", text: t("backToTeams"), onclick: () => app.backToTeams() }),
    ]),
  ]);

  mount(root, screen);
  input.focus();
}
