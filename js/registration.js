// "Unregistered" flag: lets a run (e.g. a practice tournament) be marked so
// its results are NOT auto-uploaded to GitHub on completion. Lives in its
// own localStorage key (like the language preference in i18n.js) rather
// than the versioned tournament-state blob in state.js, since it's a
// device-level setting, not tournament data — it should survive "Start New
// Tournament" and stay put until someone deliberately flips it.

const UNREGISTERED_KEY = "darts-tournament-unregistered";

let unregistered = localStorage.getItem(UNREGISTERED_KEY) === "true";

export function isUnregistered() {
  return unregistered;
}

export function setUnregistered(value) {
  unregistered = Boolean(value);
  localStorage.setItem(UNREGISTERED_KEY, String(unregistered));
}
