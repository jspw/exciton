# EXCITON — How It Works

**Status:** Mechanism design — 2026-08-15 (rewritten; supersedes the 2026-08-14 draft, which contained two reversed conclusions — see § Corrections)
**Companions:** [PRODUCT.md](PRODUCT.md) (what and why) · [QA.md](QA.md) (questions and answers)

**Evidence legend:**
- 📄 **documented** — stated in Anthropic's Claude Code documentation. This is the source of truth.
- ✅ **cross-verified** — documented *and* confirmed by measurement here (Claude Code 2.1.232, superpowers 6.3.0, macOS, 2026-08-15). One machine, one version.
- ❓ **inferred** — not documented; treat as an assumption to re-check.

---

## 1. The core model

A Claude Code session's plugin set comes from exactly two places 📄:

> Plugins are specified in one of two ways:
> * Through `claude --plugin-dir` or `claude --plugin-url`, for the duration of a session.
> * Through a marketplace, installed for future sessions.

**exciton's entire job is to turn the second off and the first on.** Everything else is bookkeeping.

Two documented primitives do all the work:

| Primitive | Effect | Source |
|---|---|---|
| `--settings '{"enabledPlugins":{"<id>":false}}'` | removes a plugin **entirely** — no hooks, no skills | 📄 ✅ |
| `--plugin-dir <dir>` | adds a plugin **for this session only**, from a directory you control | 📄 ✅ |

Combined: **disable the framework you named, then add it back in the shape you requested.**

> **Scope, revised 2026-08-16.** An earlier design disabled *every* enabled plugin and added back only what was named. That was wrong for the problem. exciton is a manager for **agentic workflow frameworks**, and the distinction that governs everything is:
>
> - **Frameworks** (superpowers, BMAD, Spec Kit) define *how the session is conducted*. Two of them fight over the same job, so they are **mutually exclusive**.
> - **Ordinary plugins** (frontend-design, ui-ux-pro-max, a language server) add a *capability*. They **compose freely** — superpowers can set the strategy while a design plugin handles the design work in the same session.
>
> So the allow-list is real, but **its universe is the framework set, not your plugin list**. exciton suppresses *every* managed framework — including ones you did not name, which would otherwise keep governing the session — then adds back the one you chose. Ordinary plugin ids are **absent from the payload entirely**. The managed set lives in `src/frameworks.ts`, currently `{superpowers}`.
>
> Naming two frameworks is refused; naming an unmanaged plugin is refused.

**exciton is not a plugin manager. It is a launcher.** `claude` starts a session from your *persistent* configuration; `exciton` starts one where a single framework is dialled to a level you chose. Same binary, same auth, same settings, same other plugins — the only difference is the shape of the named framework, and it evaporates when the process exits.

---

## 2. Background: how Claude Code plugins work

### Settings precedence 📄

Highest to lowest:

1. **Managed** (enterprise; cannot be overridden)
2. **Command line arguments** — including `--settings`
3. **Local** (`.claude/settings.local.json`)
4. **Project** (`.claude/settings.json`)
5. **User** (`~/.claude/settings.json`)

`--settings` sits at rank 2, so it beats local, project, and user. That is what makes session-scoped plugin control possible without touching any file.

> ⚠️ It also means `--settings` must be used **surgically**. An earlier design passed a whole copy of the user's settings through this flag; because CLI args outrank project and local, that would have silently inverted the user's own precedence — e.g. a project pinning `model: sonnet` would have been overridden by the user-level `model: opus`. exciton therefore passes **only** an `enabledPlugins` object and never any other key.

### `enabledPlugins` 📄

```json
{ "enabledPlugins": { "my-plugin": true, "other-plugin": false } }
```

`false` means *installed but not active*. There is no separate `disabledPlugins` key.

Plugin ids appear in `enabledPlugins` across **all** scopes — user, project, and local — so exciton must enumerate ids from every scope it can read, not just `~/.claude/settings.json`. A project-scoped enablement of the named framework, left unlisted, would survive and load alongside the staged copy.

Enumeration is still exhaustive; **selection** is not. exciton reads every scope, then keeps only the ids whose bare plugin name it was asked to manage. The same framework installed from two marketplaces yields two ids, and both are suppressed.

### Installation and enablement 📄

- `claude plugin install <name>@<marketplace>` clones into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` and records it in `installed_plugins.json` (installPath, version, gitCommitSha).
- **Plugins install enabled by default.** Only the plugin *author* can change this, via `defaultEnabled: false` in `plugin.json`.
- Marketplaces are git repos containing `.claude-plugin/marketplace.json`. The official marketplace maps each plugin to a source, e.g. superpowers → `{"source":"url","url":"https://github.com/obra/superpowers.git","sha":"b36e0829…"}` ✅.

That "install ⇒ enabled" default is why exciton **never** installs into Claude's registry: doing so would activate the framework in every ordinary `claude` session and in the VS Code extension, reproducing the exact problem the tool exists to remove.

### Plugin directory structure 📄

All at plugin root, discovered by convention — `plugin.json` does not declare their paths:

| Directory | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | manifest (name, version) |
| `skills/` | `<name>/SKILL.md` — model-invocable |
| `commands/` | flat markdown skills (legacy layout) |
| `agents/` | subagent definitions |
| `hooks/hooks.json` | **event handlers — the auto-firing surface** |
| `.mcp.json`, `.lsp.json`, `monitors/`, `bin/`, `settings.json` | other components |

Because hooks are found by convention, **omitting `hooks/` from a copied tree leaves no dangling manifest reference.** That is what makes the `--no-hooks` profile clean rather than a hack.

### `--plugin-dir` precedence 📄

> "When a `--plugin-dir` plugin has the same name as an installed marketplace plugin, the local copy takes precedence for that session. … The exception is plugins that managed settings force-enable or force-disable: `--plugin-dir` cannot override those."

Precedence is keyed on the plugin **name** ✅ — a copy renamed in `plugin.json` does *not* shadow the installed plugin. **Staged copies must preserve the original `name`.**

exciton does not rely on this precedence for correctness (it disables everything explicitly first), but it means the tool still behaves sanely if the disable step is ever skipped.

### What superpowers 6.3.0 actually is ✅

| | |
|---|---|
| Commands | **zero** |
| Agents | **zero** |
| Skills | 14 |
| Hooks | one `SessionStart`, matcher `startup\|clear\|compact` |
| Size | 2.1 MB |

`hooks/session-start` `cat`s `skills/using-superpowers/SKILL.md` and injects it wrapped in `<EXTREMELY_IMPORTANT>`. Remove `hooks/` and the file stays in `skills/`, still callable by name — nothing pushes it.

### `.in_use` is Claude's, not superpowers' ✅

`~/.claude/plugins/cache/**/.in_use/<pid>` and `.last_inuse_sweep` are Claude Code's own garbage collector, marking cache directories held by live PIDs. superpowers contains no reference to `.in_use`. Consequence: staged trees must **not** be made read-only, and stale markers from crashed sessions are normal.

---

## 3. The pipeline

Four stages. Walking `exciton superpowers --no-hooks` through concretely.

### Stage 1 · Parse

Split argv at `--`. Before it: names and flags. After it: forwarded to claude verbatim.

```
Exciton { names: ["superpowers"], profile: NoHooks, forward: [] }
```

`--no-hooks` is **session-wide**, not per-plugin: it strips hooks from every plugin in the exciton. Per-plugin granularity is deferred until someone asks for it.

### Stage 2 · Resolve

Three tiers, first hit wins. **No tier writes to Claude's plugin registry.**

| Order | Source | Cost |
|---|---|---|
| 1 | `~/.claude/plugins/installed_plugins.json` — already on disk | zero download |
| 2 | marketplace manifest → `git clone --depth 1` at the pinned sha → `~/.exciton/src/<name>/<sha>/` | one clone, cached |
| 3 | explicit `exciton https://github.com/obra/superpowers` or `exciton ./dir` | escape hatch |

Local-first means `exciton superpowers` is offline, instant, and uses the version you already have rather than silently changing it. `name@ref` forces tier 2.

Tier 2 covers the fresh machine. Marketplace entries with a `command` source (a plugin that installs by running a declared command) cannot be served by a clone — exciton detects those and **fails loudly** rather than producing a broken tree ❓ *(not yet encountered in practice; superpowers is a plain git source).*

### Stage 3 · Stage

| Profile | `--plugin-dir` target | Work |
|---|---|---|
| `full` | the resolved directory **as-is** | none — zero copy ✅ |
| `no-hooks` | `~/.exciton/staged/<key>/` — copy minus `hooks/`, `.git/`, `.in_use/` | built once |

`<key> = <name>-<version>-<sha7>-nohooks`. Because the key includes version **and** commit sha, a plugin update invalidates the staged tree automatically — no staleness logic to write.

Built to a temp directory and atomically `rename()`d, so concurrent launches cannot tear. **Not** read-only. **`plugin.json`'s `name` is preserved** — renaming breaks precedence ✅.

### Stage 4 · Exec

```sh
claude \
  --settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}' \
  --plugin-dir ~/.exciton/staged/superpowers-6.3.0-a1b2c3d-nohooks \
  [forwarded args]
```

**Every managed framework's** ids are set to `false` — gathered across user, project, and local scopes, since an id enabled in any scope would otherwise survive. This includes frameworks you did **not** name: with superpowers globally enabled, `exciton spec-kit` must silence it too, or both frameworks govern the session at once. Ids belonging to ordinary plugins never appear in the payload at all. The named framework is then added back via `--plugin-dir`. The payload contains **only** `enabledPlugins` — never any other key, for the precedence reason above.

If there is nothing to suppress (the framework is not globally enabled, so only the staged copy will load), the `--settings` flag is **omitted entirely** rather than passed with an empty object: the flag outranks project and local settings, so a launch with nothing to say must not assert it.

**Not** a real `exec` — Node has no `execve`. exciton uses `spawnSync` with inherited stdio and forwards the child's exit code, leaving a resident parent that only waits. Behaviourally equivalent here: nothing on disk is per-session so there is no cleanup, and Ctrl-C reaches `claude` directly through the foreground process group.

Implementation note: `claude -p` stalls ~3s waiting on stdin; pass `< /dev/null` in non-interactive paths ✅.

### The resulting commands

```sh
exciton                          → usage error; a framework name is required
exciton superpowers              → claude --settings '{"enabledPlugins":{"superpowers@…":false}}'
                                     --plugin-dir <source>
exciton superpowers --no-hooks   → …same, plus --plugin-dir <staged minus hooks/>
exciton ./my-superpowers-fork    → …same, from a local checkout judged by its manifest name
exciton warp                     → refused; warp is not a framework exciton manages
exciton superpowers spec-kit     → refused; frameworks are mutually exclusive
exciton spec-kit                 → suppresses superpowers too, though unnamed
```

Bare `exciton` is a usage error rather than a mode. With no framework named the payload would be empty and the launch byte-identical to plain `claude` — a reason to type `claude`, not `exciton`.

---

## 4. On-disk layout

```
~/.exciton/
  src/                                   # tier-2 clones (fresh-machine path)
    superpowers/<sha>/
  staged/                                # content-addressed, shared across sessions
    superpowers-6.3.0-a1b2c3d-nohooks/
```

Two directories, both pure cache. `exciton clean` empties them; they rebuild on next use. **There is no run state anywhere** — which dissolves the crash-cleanup problem rather than solving it. No settings files are written: the `enabledPlugins` payload is passed inline as a JSON string.

### The integrity invariant

**exciton reads Claude's state and writes only inside `~/.exciton/`.**

📄 *"These are temporary and don't modify any settings files."* ✅ Confirmed by checksumming `settings.json`, `installed_plugins.json`, and `known_marketplaces.json` before and after a launch — all unchanged.

Caveat: `~/.claude.json` is excluded from that check because *every* `claude` run writes it (session records, `pluginUsage`), with or without exciton ❓.

---

## 5. Extension seam

**`Source` — where a name resolves from.** `resolve(name) → { id, dir, version, sha }`. Stages 3–4 only ever see a directory, so adding a source implementation touches nothing downstream.

**`Adapter` — what `--no-hooks` strips.** Default: `["hooks/"]`. Because hook discovery is by convention 📄, this default is correct for *every* plugin-shaped framework, not just superpowers. An adapter entry is needed only for a framework at a non-default subpath or absent from all marketplaces:

```yaml
bmad:
  repo: https://github.com/.../BMAD-METHOD
  ref: main
  subpath: .
```

---

## 6. Known limitations

| Limitation | Detail |
|---|---|
| **Managed settings** 📄 | `--plugin-dir` cannot override plugins that enterprise-managed settings force-enable or force-disable. Managed settings also outrank `--settings`. exciton cannot help managed users; it should detect and say so. |
| **Multi-scope enumeration** | Plugin ids must be collected from user, project, **and** local settings. Missing a scope leaves that plugin enabled. |
| **`command`-source plugins** ❓ | Cannot be fetched by clone. Detect and fail loudly. |
| **Scaffolder frameworks** | Spec Kit / OpenSpec write into your repo; "session-only" does not apply. Out of scope. |

---

## 7. Testing

**Claude Code's `--debug-file` output is the assertion surface**, using these lines and no others:

| Line | Means |
|---|---|
| `Registered N hooks from M plugins` | **actual registration** |
| `Hook SessionStart … provided additionalContext` | **actual execution** |
| `load skills from plugin X … skillsPath: …` | where skills resolved from |

> ⚠️ **Do not assert on `Read hooks.json for plugin X`.** That line is *discovery* and appears for plugins that are never registered. In the verified production run, discovery listed `warp` and `understand-anything` while `Registered 0 hooks` — misreading this line is what produced the reversed conclusions in the previous draft.

> ⚠️ **Never assert on the model's self-report of its own context.** It gave contradictory answers for identical commands during investigation.

Regression suite (all currently passing):

```
T1 baseline                    → hooks=9 inject=1     (control)
T2 --plugin-dir nohooks        → hooks=8 inject=0     precedence drops installed hook
T3 --plugin-dir full           → hooks=9 inject=1     exactly one, no double injection
T4 --settings {id:false}       → hooks=8 inject=0     plugin gone entirely
T5 --settings {all:false}      → hooks=0 inject=0     bare `exciton`
T6 renamed copy                → hooks=9 inject=1     precedence is name-keyed
T7 integrity                   → Claude state files unchanged
P1 all-false + plugin-dir nohooks → hooks=0 inject=0, skills from staged   ← `exciton superpowers --no-hooks`
P2 all-false + plugin-dir full    → hooks=1 inject=1, skills from staged   ← `exciton superpowers`
```

Each test states the **documented prediction** first and passes only if measurement matches. Run against each new Claude Code release: this is what turns an upstream behavior change from a silent breakage into a failing test.

---

## 8. Corrections to the 2026-08-14 draft

Recorded because the errors are instructive, and because anyone re-deriving this from the old draft would build the wrong thing.

| Claim in the old draft | Reality |
|---|---|
| "`--plugin-dir` hooks are **additive**; a same-named global plugin still fires" | **Wrong.** The local copy takes precedence 📄 ✅. A hookless copy suppresses the installed hook with no other flags. |
| "`full` profile **double-injects** when the plugin is also installed" | **Wrong.** Exactly one injection ✅. |
| "Suppression via `--setting-sources` + a synthesized settings copy is **mandatory**" | **Unnecessary**, and actively harmful — it would have inverted settings precedence. |
| "`--settings` cannot remove a plugin" | **Wrong.** It can, via an explicit `false` value 📄 ✅. The earlier test passed `{}`, which correctly did nothing. |

**Root cause:** the investigation was empirical-first. Behavior was inferred from log lines whose meaning had not been established, with no documented baseline to check against. Two conclusions came out reversed, and a correct signal was discarded as noise because it disagreed with the wrong reading.

**Rule adopted:** documentation first; measurement only to confirm, always labelled as one machine and one version.
