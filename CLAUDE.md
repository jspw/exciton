# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

exciton is a CLI (`exciton` / `xc`) that runs Claude Code with an agentic workflow framework (currently only `superpowers`) dialled to a chosen profile — full, or `--no-hooks` (skills stay callable, nothing auto-fires) — for a single session, without writing anything under `~/.claude`. A framework must be **added** (`exciton add`) before it will run; first invocation with no config runs an onboarding walkthrough. It does this using two documented Claude Code primitives: `--settings '{"enabledPlugins":{...}}'` to disable plugins for the session, and `--plugin-dir <dir>` to add one in. See [MECHANISM.md](MECHANISM.md) for the full mechanism and verification evidence, [PRODUCT.md](PRODUCT.md) for scope, and [QA.md](QA.md) for the reasoning behind specific design decisions.

## Commands

```sh
npm run build              # tsc: src/ -> dist/
npm test                   # unit tests: node --test --test-concurrency=2 test/*.test.ts
npm run test:integration   # integration tests: shells out to a real `claude` binary; needs claude installed
```

Run a single unit test file directly, e.g.:

```sh
node --test --test-concurrency=2 test/resolve.test.ts
```

There is no separate lint command. `tsc` (via `npm run build`) is the type check; `strict` mode is on.

Source files are plain `.ts` run directly by Node (no build step needed for tests) — this repo relies on Node ≥22.18's unflagged TypeScript stripping, which is why that version is the floor in `package.json` `engines` and why CI matrixes `22.18.0` and `24.x`. `npm test` runs `test/*.test.ts` directly, not compiled output.

## Architecture

The whole CLI is ~1,800 lines across `src/`. Read the files, not a summary — but here's the shape of how a run flows through them, since that requires connecting several files:

1. **`cli.ts`** — entry point. `parseArgs` splits argv on `--` (everything after is forwarded verbatim to `claude`); before it, one positional arg is the framework name/path/spec, `--no-hooks` picks the profile, subcommands (`add`, `remove`, `update`, `list`, `clean`, `help`, `version`) short-circuit before framework resolution. `run()` orchestrates the rest of the pipeline below and is the place to look first when tracing behavior. It also fires onboarding on first contact and enforces `assertAdded` — a framework absent from the registry does not run.
2. **`registry.ts`** — `~/.exciton/config.json`: which frameworks have been added and which copy each runs from (`installed` = Claude's, `own` = exciton's clone). Split into two I/O functions taking an injectable path and six pure ones. `onboardedAt` distinguishes "never onboarded" from "onboarded and chose nothing" — without it, opting out would re-trigger the walkthrough forever.
3. **`resolve.ts`** (`resolvePlugin`) — turns a bare name, a full plugin id (`name@marketplace` — the marketplace half is ignored, since exciton has no version syntax), or a path spec into a `Resolved` (dir, version, sha, origin). Tries, in order: path spec → already-installed plugin (`installed.ts`) → a marketplace entry (`marketplace.ts`) cloned via `fetch.ts` into exciton's own cache. **`{ ownCopy: true }` skips the installed lookup** — without it `source: 'own'` would silently resolve to Claude's copy and the choice would be decorative. `fetch.ts` resolves the newest *release tag* (`git ls-remote --tags --refs`, numeric compare, pre-releases excluded) and clones it in one `git clone --depth 1 --branch <tag>`.
4. **`frameworks.ts`** — the `FRAMEWORKS` set (currently just `superpowers`) is the single source of truth for what exciton is allowed to manage. `cli.ts` uses `assertManaged`/`assertSingleFramework` to refuse anything not in this set and refuse naming two frameworks at once — frameworks are mutually exclusive by design (they compete to define how a session is conducted), while ordinary plugins are left completely untouched.
5. **`settings.ts`** (`collectPluginIds`) — reads `enabledPlugins` across every settings scope (user, project, project-local, enterprise-managed) to find every *managed-framework* id currently enabled anywhere, even ones not named on the command line — those must still be suppressed, or a second framework would keep silently governing the session. `buildDisablePayload` turns that into the `--settings` JSON, touching only the `enabledPlugins` key (any other key would outrank project/local settings).
6. **`stage.ts`** (`stagePlugin`) — for the `full` profile, points `--plugin-dir` straight at the resolved source (zero copy). For `nohooks`, atomically builds a cached copy under `~/.exciton/staged/` with the `hooks/` directory filtered out, keyed by name+version+sha so it's built once. Hooks are discovered by convention in Claude Code, so removing the directory is enough to make nothing auto-fire while skills remain callable.
7. **`launch.ts`** — spawns `claude` with inherited stdio (`spawnSync`, not `execve` — Node has none) and forwards its exit code; builds argv as `--settings <payload>? --plugin-dir <dir>... <forwarded args>`.
8. **`commands/list.ts`**, **`commands/manage.ts`**, **`commands/cache.ts`** — `list` cross-references installed plugins against enabled ids, hook presence, and the registry, split into a frameworks section (what exciton runs) and an untouched-plugins section; `manage.ts` holds `add`/`remove`/`update` behind injectable deps (`chooseSource`, `fetch`, `interactive`) so the decision trees are tested without a terminal; `clean` empties the cache but refuses while a live session is running from it, detected by scanning `ps` for `--plugin-dir` under the exciton root.
9. **`onboarding.ts`**, **`prompt.ts`**, **`ui.ts`** — the interactive layer. `onboarding.ts` is the first-run walkthrough; `prompt.ts` is a hand-rolled arrow-key `select`/`multiselect`; `ui.ts` holds every user-facing shape.

### The interactive layer

Three rules hold it together, and breaking any of them has already caused a bug here:

- **Zero runtime dependencies.** `prompt.ts` hand-rolls raw-mode key reading (via `/dev/tty`, not fd 0 — a non-blocking stdin makes `readSync` throw `EAGAIN`) and `ui.ts` emits SGR codes directly. A prompt or colour library would be this project's first runtime dependency.
- **Terminal I/O stays thin; decisions are injected.** `askSource`, `fetch`, and `interactive` are `ManageDeps` fields, so every branch of `add`/`remove`/`update`/onboarding is tested with no terminal. `prompt.ts` exposes `activeLines`/`collapsedLines`/`keyHint` as pure functions so the rendering is testable too.
- **Nothing prompts without `isInteractive()`.** In CI, onboarding is skipped and an ambiguous `add` fails with instructions rather than blocking on a keypress that will never arrive.

`ui.ts` owns every user-facing shape: `failure`/`success`/`note` blocks, `UserError` (which carries its own rendering — the top-level handler used to prefix `exciton: ` onto messages that already said "exciton"), `wrap` (which leaves already-fitting lines untouched so deliberate alignment survives), and the rail glyphs. Use `styler(stream)` rather than the bare `bold`/`dim` helpers when writing to stdout — help goes to stdout while messages go to stderr, and colour must follow the stream actually being written to.

Onboarding renders as a **connected rail** (`┌ … ◇ … └`) where each answered question collapses to one line. The collapse is why `repaint` clears with `\x1b[0J`: frames shrink, and without it the tail of an expanded list is stranded on screen. The closing deliberately does not restate which copy was chosen — the collapsed step above still shows it.

**Invariant that shapes most of this code**: nothing under `~/.claude` is ever written. All caching and staging happens under `~/.exciton/` — `staged/` and `src/` are disposable cache, `config.json` is not, which is why `clean` empties the first two and never the third.

**No version selection, deliberately.** exciton tracks releases, not commits: `fetch.ts` resolves the newest tag and clones it directly. Dropping `name@ref` also dissolved a collision with Claude's own `name@marketplace` plugin ids — `@` now has one meaning, and the marketplace half is ignored. Do not reintroduce a ref syntax without re-reading MECHANISM.md § Versions. Every function that touches the filesystem or shells out takes its dependency as an injectable parameter with a real default (e.g. `Runner` in `fetch.ts`, `SpawnFn` in `launch.ts`, `target`/`resolveDir` closures in `stage.ts`) — this is what makes the unit tests hermetic without touching a real home directory or network. Follow that pattern for new code in this area rather than reaching for a mocking library.

Widening `FRAMEWORKS` to support a new framework is a deliberate, explicit act (see the comment in `frameworks.ts`) — it requires confirming a staging profile (hook layout) that's known to work for that framework, not just adding a string to the set.

## Testing notes

- Unit tests (`test/*.test.ts`) mirror `src/*.ts` one-to-one and inject fakes for filesystem/process boundaries — no real `~/.claude` or `~/.exciton` access. Interactive flows are covered by injecting the prompt functions; `test/prompt.test.ts` covers the rendering separately as pure functions.
- **Assert on what the user sees.** `assert.throws(fn, /re/)` matches only `err.message`, which for a `UserError` is the headline — the actionable half lives in `details`. Six tests once passed while never checking that the fix instruction reached the user. Render the error and match against that instead.
- To exercise the CLI end-to-end without touching real state, point `HOME` at a temp dir and symlink `.claude` into it: `SANDBOX=$(mktemp -d); ln -s ~/.claude "$SANDBOX/.claude"; HOME=$SANDBOX node src/cli.ts …`
- `test/integration/session.test.ts` + `helpers.ts` run a real `claude --debug-file ... -p hi` and parse its debug log. Per a hard-won lesson recorded in `helpers.ts`: never assert on "Read hooks.json for plugin X" — that's plugin *discovery* and appears even for plugins that never get registered; assert on `Registered N hooks` (registration) and `provided additionalContext` occurrences (actual hook execution) instead.
