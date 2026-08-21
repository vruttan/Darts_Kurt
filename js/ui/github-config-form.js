// GitHub token/branch config form, shared by the champion screen (which
// uses it to configure results upload) and the history screen (which uses
// it to configure browsing past results) — both call it with their own
// onSave callback rather than this module knowing what happens next.

import { el } from "./render.js";
import { t } from "../i18n.js";

export function renderGithubConfigForm(root, state, app, config, onSave) {
  const tokenInput = el("input", { type: "text", placeholder: t("githubTokenLabel"), value: config.token });
  const branchInput = el("input", { type: "text", placeholder: t("githubBranchLabel"), value: config.branch });

  const fieldsFilled = () => tokenInput.value.trim();

  const saveButton = el("button", {
    class: "primary",
    text: t("saveAndUpload"),
    onclick: () => {
      if (!fieldsFilled()) return;
      onSave({
        token: tokenInput.value,
        branch: branchInput.value,
      });
    },
  });
  saveButton.disabled = !fieldsFilled();
  tokenInput.addEventListener("input", () => {
    saveButton.disabled = !fieldsFilled();
  });

  return el("div", { class: "panel" }, [
    el("h2", { text: t("githubSectionTitle") }),
    el("p", { class: "subtitle", text: t("githubSetupIntro") }),
    el("p", { class: "waiting-strip", text: t("githubTokenHelp") }),
    tokenInput,
    branchInput,
    el("div", { class: "actions" }, [saveButton]),
  ]);
}
