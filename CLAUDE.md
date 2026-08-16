# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, offline-first PWA for running double-elimination darts tournaments (doubles teams). No build step, no framework, no bundler — plain ES modules loaded directly by the browser, installable via a cache-first service worker. `package.json` exists solely so the bracket test can run under Node.

## Commands

- Run tests: `npm test` (equivalent to `node tests/bracket.test.js`)
- No build, lint, or dev-server step exists. To try the app in a browser, serve the directory statically (e.g. `python3 -m http.server`) — opening `index.html` via `file://` will not register the service worker correctly for all browsers.
- There is no test runner dependency: `tests/bracket.test.js` is a plain assert-based script. Add new cases as more `test("name", () => { ... })` calls in that file; there's no framework API beyond `test`/`assert`.

## Architecture

**Data flow is one-directional and centered on a single mutable `state` object**, held in `js/app.js` and persisted to `localStorage` after every mutation:

- `js/state.js` — creates/loads/saves the state object (schema-versioned; a version mismatch on load discards saved state rather than migrating it) and defines the phase machine: `setup → teams → boards → live → complete`.
- `js/players.js` — player entry and random team pairing (Fisher-Yates shuffle from `util.js`); handles the odd-player-sits-out case and lets the sit-out player be swapped later.
- `js/bracket.js` — pure, DOM-free double-elimination bracket generation and advancement. This is the algorithmic core of the app and the only module with real complexity.
- `js/boards.js` — ready-match queue + automatic board assignment (fills free boards with the next ready matches); `recordResult()` is the single entry point that ties board-freeing, bracket advancement, and board-refilling together.
- `js/export.js` — client-side-only HTML report + JSON dump export via `Blob` + anchor download, no server involved.
- `js/ui/*.js` — one render function per screen (`setup-view.js`, `match-view.js`, `champion-view.js`), plus `render.js`'s tiny `el()` hyperscript-style helper (framework-free DOM construction) and `mount()`. Views are pure functions of `(root, state, app)` — they read state and call methods on `app`, never mutate state directly.
- `js/app.js` — wires everything together: owns the `state` variable, exposes an `app` object of action methods (each mutates state via the modules above, then calls `persistAndRender()`), and a `render()` switch that picks the view function for `state.phase`.

**Bracket generation model** (`js/bracket.js`): the entire bracket graph (winners bracket, losers bracket, grand final + reset match) is generated upfront before any match is played. Non-seeded match slots are filled via explicit `{matchId, slot}` source pointers rather than an implicit tree — this is necessary because losers-bracket matches are fed from two different places (a previous losers-bracket winner, and a same-round winners-bracket loser). `propagateFrom()` walks the graph on every match completion, filling in downstream slots, flipping matches to `"ready"` once both slots are known, and cascading through bye matches recursively. Grand final reset logic (`handleGrandFinalLogic`/`checkChampion`) is a special case bolted onto this graph: a second match (`gf-2`) only gets populated/activated if the losers-bracket side wins game 1.

**Seeding**: `util.js`'s `seedOrder()` produces standard bracket-seeding order (spreads byes/top seeds evenly) recursively; byes occur only in winners-bracket round 1 for non-power-of-2 entrant counts.

**State shape** (see `state.js`'s `createInitialState()` for the canonical shape): `matches` is a map keyed by match id (e.g. `wb-r1-m1`, `lb-r2-m1`, `gf-1`, `gf-2`) with `matchOrder` as a separate array preserving generation order for stable display/iteration. Each match carries `status` (`pending → ready → in-progress → complete`), `teamASource`/`teamBSource` pointers, and `boardNumber`.

## Testing conventions

`tests/bracket.test.js` tests `bracket.js` in isolation (it's pure and has zero DOM dependencies, so it runs directly under Node). Tests are structural (bracket shape correctness across a range of team counts: 2,3,5,6,7,8,9,10,16) and simulation-based (`playAllExcept()` plays every ready match to completion with a pluggable `chooseWinner` strategy, then asserts invariants like "every eliminated team has exactly 2 losses" and "exactly one champion"). When changing bracket/advancement logic, prefer extending these structural + simulation checks over hand-written single-match assertions, since they catch wiring bugs across many bracket sizes at once.
