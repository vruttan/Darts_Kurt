// GitHub Contents API client for saving tournament results to a private
// results repo, plus the localStorage-backed config for it. Deliberately has
// no DOM/i18n dependency (like bracket.js/boards.js) — callers map the
// returned `kind` strings to translated text themselves.
//
// Owner/repo are fixed to this app's results repo rather than user-entered:
// they aren't secret, so hardcoding them means anyone setting this up on a
// new device only ever has to supply the (secret, never-hardcoded) token.

const CONFIG_KEY = "darts-tournament-github-config";
const DEFAULT_OWNER = "vruttan";
const DEFAULT_REPO = "Darts_Kurt_Results";
const DEFAULT_PATH_PREFIX = "results";
const API_VERSION = "2022-11-28";

export function loadConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  const saved = raw ? JSON.parse(raw) : {};
  return {
    token: saved.token || "",
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    branch: saved.branch || "",
    pathPrefix: saved.pathPrefix || DEFAULT_PATH_PREFIX,
  };
}

export function saveConfig(partial) {
  const current = loadConfig();
  const next = {
    token: (partial.token ?? current.token).trim(),
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    branch: (partial.branch ?? current.branch).trim(),
    pathPrefix: (partial.pathPrefix ?? current.pathPrefix).trim() || DEFAULT_PATH_PREFIX,
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function hasConfig(config) {
  return Boolean(config.token);
}

export function resultsPath(config, summary) {
  const slug = summary.date.replace(/[:.]/g, "-");
  return `${config.pathPrefix || DEFAULT_PATH_PREFIX}/${slug}.json`;
}

// btoa() only handles Latin1, so UTF-8 bytes (accented Spanish names, etc.)
// need to be widened to Latin1 code points first. Chunked to stay well under
// any engine's max call-stack-arguments limit for very long results.
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function apiHeaders(config) {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "Content-Type": "application/json",
  };
}

function contentsUrl(config, path) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
}

async function putFile(config, path, body) {
  return fetch(contentsUrl(config, path), {
    method: "PUT",
    headers: apiHeaders(config),
    body: JSON.stringify(body),
  });
}

// Uploads `summary` (a plain results object, see export.js's
// buildResultsSummary) to `path` in the configured repo, creating a new file.
// Never throws — always resolves to a normalized result so callers can
// render a status without try/catch plumbing.
export async function uploadResults(config, summary, path) {
  const message = `Tournament results — champion ${summary.champion.teamName} (${summary.date})`;
  const content = utf8ToBase64(JSON.stringify(summary, null, 2));
  const body = { message, content, ...(config.branch ? { branch: config.branch } : {}) };

  let response;
  try {
    response = await putFile(config, path, body);
  } catch {
    return { ok: false, kind: "network" };
  }

  if (response.ok) {
    const json = await response.json();
    return { ok: true, path, htmlUrl: json.content && json.content.html_url };
  }

  if (response.status === 401) return { ok: false, kind: "auth" };
  if (response.status === 404) return { ok: false, kind: "notfound" };

  if (response.status === 422) {
    // Most likely a file already exists at this path (e.g. a prior attempt
    // landed on GitHub but the client never saw the response) — the
    // Contents API requires the existing file's `sha` to overwrite it.
    // Look it up and retry once; anything past that is a real conflict.
    let existing;
    try {
      existing = await fetch(contentsUrl(config, path), { headers: apiHeaders(config) });
    } catch {
      return { ok: false, kind: "network" };
    }
    if (!existing.ok) return { ok: false, kind: "conflict" };
    const existingJson = await existing.json();
    let retry;
    try {
      retry = await putFile(config, path, { ...body, sha: existingJson.sha });
    } catch {
      return { ok: false, kind: "network" };
    }
    if (!retry.ok) return { ok: false, kind: "conflict" };
    const retryJson = await retry.json();
    return { ok: true, path, htmlUrl: retryJson.content && retryJson.content.html_url };
  }

  return { ok: false, kind: "other", status: response.status };
}
