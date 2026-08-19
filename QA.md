# EXCITON — Questions & Answers

**Status:** 2026-08-15 (rewritten after documentation research — several answers in the 2026-08-14 draft were backwards; see § Corrections)
**Companions:** [PRODUCT.md](PRODUCT.md) (what and why) · [MECHANISM.md](MECHANISM.md) (how it works)

**Evidence legend:** 📄 documented by Anthropic · ✅ documented *and* cross-verified here (Claude Code 2.1.232, superpowers 6.3.0, macOS, 2026-08-15 — one machine, one version) · ❓ inferred, unverified

---

## Mechanism

### What exactly is `--plugin-dir`? Is it a hack?

No — it's a documented, intended feature 📄:

> `--plugin-dir <path>` — Load a plugin from a directory or .zip for this session only (repeatable)

Anthropic's own plugin-authoring guide uses it as the standard way to test a plugin without installing it. There's also `--plugin-url` for a remote `.zip`.

### What happens if a `--plugin-dir` plugin has the same name as an installed one?

📄 *"the local copy takes precedence for that session. This lets you test changes to a plugin you already have installed without uninstalling it first."*

✅ Confirmed: loading a hookless copy of superpowers while superpowers is installed and enabled dropped hook registration from 9 to 8 and produced **zero** injections — with no other flags. Loading a full copy produced **exactly one** injection, not two.

**Precedence is keyed on the plugin's `name`** ✅ — a copy renamed in `plugin.json` does *not* shadow the installed plugin. Staged copies must preserve the original name.

### So how does exciton prevent superpowers from loading?

Two documented primitives:

| Primitive | Effect |
|---|---|
| `--settings '{"enabledPlugins":{"<id>":false}}'` | removes the plugin entirely — no hooks, no skills 📄 ✅ |
| `--plugin-dir <dir>` | adds a plugin for this session only 📄 ✅ |

exciton disables **the framework you named** — and only that — then adds it back in the shape you asked for:

```sh
exciton superpowers --no-hooks
  → claude --settings '{"enabledPlugins":{"superpowers@claude-plugins-official":false}}' \
           --plugin-dir ~/.exciton/staged/superpowers-…-nohooks
```

No other plugin id appears in that payload, which is what leaves the rest of your setup alone.

Measured result ✅: superpowers' skills load from the staged directory — callable by name, nothing auto-firing — while every other plugin's hooks register as usual.

### Why does disabling a plugin this way work? Doesn't user settings win?

Settings precedence, highest to lowest 📄: **Managed → Command line arguments → Local → Project → User.** `--settings` is a command-line argument at rank 2, so it beats your user, project, and local settings.

That same fact is a hazard: exciton passes **only** an `enabledPlugins` object through `--settings`, never any other key. An earlier design passed a whole copy of user settings, which would have silently inverted your own precedence — a project pinning `model: sonnet` would have lost to a user-level `model: opus`.

### Is suppression persuasion or enforcement?

Enforcement, by configuration. Nothing is argued with the model. A plugin that was never enabled has no hook to fire. This satisfies [PROBLEM.md](PROBLEM.md)'s "deterministic over persuasive" constraint.

### What happens if the session crashes? Do stale directories pile up?

No — **nothing on disk is per-session**. A staged tree is a pure function of `(plugin, version, sha, profile)`, so it's cache, not run state; two sessions with the same exciton share one directory. There's no run directory to orphan. `exciton clean` prunes the cache when you want the space back.

### Why `exec` instead of supervising the child process?

Nothing needs cleaning up. `exec` means exciton replaces itself: no resident process, no signal forwarding, no TTY passthrough, no PID tracking.

---

## Claude Code plugins in general

### How does the plugin system work?

- **Marketplace** 📄 — a git repo with `.claude-plugin/marketplace.json`, cloned to `~/.claude/plugins/marketplaces/<name>/`. The official one lists 287 plugins ✅.
- **Install** 📄 — `claude plugin install <name>@<marketplace>` clones into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, recorded in `installed_plugins.json`.
- **Enable** 📄 — `settings.json → enabledPlugins`, mapping `"<plugin>@<marketplace>"` to `true` or `false`. `false` means installed but not active.
- **Load** — at startup, for each *enabled* plugin, Claude reads by convention: `hooks/hooks.json`, `skills/`, `commands/`, `agents/`, plus `.mcp.json`, `.lsp.json`, `monitors/`, `bin/`.

### Does installing a plugin enable it?

**Yes** 📄 — *"plugins install enabled by default."* Only the plugin author can change that, via `defaultEnabled: false` in `plugin.json`. This is the single most important fact behind exciton's no-install policy.

### Does `plugin.json` declare where hooks live?

**No** 📄 — discovery is by convention at `hooks/hooks.json`. Omitting `hooks/` from a staged copy therefore leaves **no dangling manifest reference**, and the default "strip `hooks/`" rule is correct for *every* plugin-shaped framework.

### What is superpowers, structurally?

✅ superpowers 6.3.0: **zero commands, zero agents**, 14 skills, one `SessionStart` hook, 2.1 MB. `hooks/session-start` `cat`s `skills/using-superpowers/SKILL.md` and injects it wrapped in `<EXTREMELY_IMPORTANT>`.

So `--no-hooks` means: skills callable by name, nothing else. Precisely what [issue #645](https://github.com/obra/superpowers/issues/645) asked for and didn't get.

### What are the `.in_use` files in the plugin cache?

**Claude Code's own garbage collector** ✅ — PID-named markers showing which cache directories are held by live sessions, swept periodically. superpowers contains no reference to `.in_use`. Consequence: staged trees must not be read-only, and stale markers from crashed sessions are normal.

---

## Fresh machines and installation

### Someone has never installed superpowers. What happens?

1. `installed_plugins.json` — miss.
2. **Marketplace manifest.** It already maps name → git URL → pinned sha ✅ (superpowers → `https://github.com/obra/superpowers.git` at a pinned commit). exciton clones that into `~/.exciton/src/superpowers/<sha>/`.
3. Explicit `exciton https://github.com/obra/superpowers` or `exciton ./dir`.

Then stage and exec. **Claude never learns superpowers exists.**

### Why not just use `claude plugin install` under the hood?

It reuses tested machinery, which is genuinely attractive — but **plugins install enabled by default** 📄. Installing superpowers would make it active in every ordinary `claude` session *and* in the VS Code extension, which is exactly the pain the tool exists to remove.

Install-then-disable was considered and rejected: it leaves permanent registry state, has a window where the plugin is live, and any failure in the disable step silently makes superpowers global.

**exciton never touches Claude's plugin registry.** The network fetch still happens on a fresh machine — it just lands in `~/.exciton/`.

### So exciton needs its own registry of frameworks?

Mostly no. **Claude's marketplace manifests are the registry**, covering 287 plugins in the official marketplace alone. A hand-written adapter entry is needed only for a framework in no marketplace or at a non-default subpath (the BMAD / SuperClaude case) — three lines.

### Will there be an install command?

**No, deliberately.** The verb set is `exciton`, `exciton list`, `exciton fetch` (optional cache prewarm), `exciton clean`. Installation is Claude's concept; exciton's concept is *use*.

### Does `exciton superpowers` change which version I have installed?

No. Local resolution is first, so it uses the version already on disk — offline, instant, no surprise upgrade. `exciton superpowers@6.2.0` fetches that ref into exciton's own cache, still without touching Claude's.

---

## Impact on your setup

### Are we modifying Claude's defaults?

**No.** 📄 *"These are temporary and don't modify any settings files."* ✅ Confirmed by checksumming `settings.json`, `installed_plugins.json`, and `known_marketplaces.json` before and after a launch — all unchanged.

The invariant: **exciton reads Claude's state and writes only inside `~/.exciton/`.** Every change is a CLI flag on one process. Quit exciton, run `claude`, and it behaves exactly as before.

Caveat: `~/.claude.json` is excluded from that check because *every* `claude` run writes it (session records, `pluginUsage`) with or without exciton ❓.

### Why does exciton manage frameworks but not plugins?

Because they play different roles, and only one of them has the problem.

A **framework** — superpowers, BMAD, Spec Kit — defines *how the session is conducted*: when you plan, how much ceremony, what happens before you write code. Two frameworks in one session fight over that same job. They are mutually exclusive, and today the only way to switch is to uninstall one.

An **ordinary plugin** — frontend-design, ui-ux-pro-max, a language server — adds a *capability* in one domain. Any number can be active. superpowers setting the approach while frontend-design handles the design work is a session working exactly as intended.

So exciton manages the first category and ignores the second. `frontend-design` is not a competitor of superpowers; stopping it would break a session you deliberately assembled.

### Does using exciton disable my other frameworks?

**Yes — that is the point.** `exciton spec-kit` suppresses superpowers too, even though you did not name it. Leaving a globally-enabled framework running alongside the one you chose would reproduce the exact mixture the tool exists to prevent.

Naming two at once is refused: `exciton superpowers spec-kit` exits 1.

### Does using exciton disable my other plugins?

**No.** exciton touches only frameworks. `exciton superpowers --no-hooks` leaves warp, understand-anything, ui-ux-pro-max, swift-lsp and everything else running exactly as your settings have them — their ids never enter the `--settings` payload, so your own configuration keeps governing them.

Measured ✅ (2026-08-16): a normal session and `exciton superpowers --no-hooks` both report skills from `superpowers, understand-anything, ui-ux-pro-max, frontend-design`. The only difference is that superpowers no longer auto-fires. Under `--no-hooks` the registered-hook count drops by exactly one — superpowers' — and every other plugin's hooks still register.

Your personal skills in `~/.claude/skills/`, the built-in Claude Code skills, and your `CLAUDE.md` are likewise untouched.

> **Superseded answer, kept for the record.** This previously read *"For that session, yes — by design. The semantic is 'the session's plugin set is exactly what you name.'"* exciton was built that way, then the design was rejected on contact with real use: the problem it exists to solve is *frameworks governing globally*, and suppressing an unrelated linter or design helper serves no part of it.

### Do I lose my settings, statusline, theme, or personal hooks?

No. exciton passes **only** an `enabledPlugins` object through `--settings`. Every other key in your settings resolves normally, at its normal precedence.

### Is `exciton` with no arguments just `claude`?

**Bare `exciton` is a usage error.** It prints help and exits 1.

That is exactly *because* it would otherwise be indistinguishable from `claude`. Since exciton only suppresses frameworks you name, naming nothing means suppressing nothing — the `--settings` flag is not even passed. A command that duplicates `claude` is a command with no reason to exist, so exciton asks for a framework instead.

> **Superseded answer.** This previously read *"No. `claude` loads every enabled plugin; `exciton` loads none — a genuinely clean session."* That followed from the allow-list design, which no longer holds. If you want a session with no plugins at all, exciton is not the tool.

### Why not just use `--bare`?

`--bare` skips hooks, but 📄 *"OAuth and keychain are never read"* — it requires `ANTHROPIC_API_KEY`, so subscription users can't use it. It also disables CLAUDE.md discovery, auto-memory, and LSP. A sledgehammer; exciton removes exactly what you ask it to.

### Does this work on an enterprise-managed machine?

Not fully 📄: `--plugin-dir` cannot override plugins that managed settings force-enable or force-disable, and managed settings outrank command-line arguments. exciton should detect this and say so rather than appear to work.

---

## Product decisions

### Why "exciton" and not "lesspowers"?

The idea pivoted — it's no longer *less* of anything, it's *explicit instead of ambient*. A exciton is what you equip for a single mission.

Availability ✅: `exciton`/`exciton` free as commands, Homebrew formula free, `exciton` free on npm. Bare `exciton` and `exciton-cli` are taken by abandoned packages — one of them itself a dead Claude Code config tool.

### Why `--no-hooks` instead of `--quiet`?

A flag named for its **promise** over-promises; one named for its **mechanism** can't. `--quiet` also carries the intensity-dial connotation the product moved away from. `--no-hooks` states exactly what it omits and gives hookless frameworks an honest answer: *nothing, and here's a notice saying so.*

### Does `--no-hooks` fully stop skills from auto-firing?

It stops **deterministic** firing — the hook injection ✅. It does not remove the **probabilistic** pull of imperative skill descriptions (`"You MUST use this before any creative work"`) sitting in the tool list.

We deliberately don't fight that layer: rewriting descriptions would modify upstream content (a stated non-goal) *and* be prompt-vs-prompt, which [PROBLEM.md:52](PROBLEM.md#L52) rejects. The flag's name is honest about the boundary.

### Is `--no-hooks` per-plugin or session-wide?

Session-wide for v1. Per-plugin granularity is YAGNI until someone asks.

### Windows?

POSIX only (macOS + Linux) for v1, by decision.

### What if upstream ships `SUPERPOWERS_MODE` after all?

Single-framework value drops; the general plugin-set value survives. That's the main argument for not scoping the product to superpowers alone, even while v1 targets it.

### Isn't this just a shell script?

A few hundred lines — the "thin product" risk stays on the register. What makes it more than an alias: the correct mechanism is genuinely non-obvious. Three plausible approaches fail, two of them **silently** — delete `hooks/` from an installed plugin (no effect on the installed copy), pass `--settings '{"enabledPlugins":{}}'` (adds nothing, removes nothing), or hand `--settings` a full copy of user settings (inverts your precedence).

---

## How this was verified

### What is the source of truth?

**Anthropic's Claude Code documentation.** Measurement is used only to confirm documented behavior, and every measured claim is labelled with the version and machine it came from.

This order was adopted after the first pass got it backwards — see Corrections below.

### What is the instrument?

Claude Code's `--debug-file` output, using exactly three line types:

| Line | Means |
|---|---|
| `Registered N hooks from M plugins` | actual registration |
| `Hook SessionStart … provided additionalContext` | actual **execution** |
| `load skills from plugin X … skillsPath:` | where skills resolved from |

> ⚠️ **`Read hooks.json for plugin X` is discovery, not registration.** It appears for plugins that are never registered. In the verified production run it listed `warp` and `understand-anything` while `Registered 0 hooks`. Misreading this line caused the reversed conclusions below.

> ⚠️ **Never assert on the model's self-report of its own context.** It gave contradictory answers for identical commands.

---

## Corrections to the 2026-08-14 draft

| Claim in the old draft | Reality |
|---|---|
| "`--plugin-dir` hooks are **additive**; a same-named installed plugin still fires" | **Wrong.** The local copy takes precedence 📄 ✅. |
| "`full` profile **double-injects**" | **Wrong.** Exactly one injection ✅. |
| "Suppression via `--setting-sources` + a synthesized settings copy is **mandatory**" | **Unnecessary and harmful** — it would have inverted settings precedence. |
| "`--settings` cannot remove a plugin" | **Wrong.** It can, via an explicit `false` 📄 ✅. The earlier test passed `{}`, which correctly did nothing. |
| Risk: "**High** — depends on three undocumented behaviors" | **Withdrawn.** An artifact of the wrong mechanism. The corrected design rests on documented API. |

**Root cause:** the first pass was empirical-first, inferring behavior from log lines whose meaning hadn't been established, with no documented baseline to check against. A correct signal was even discarded as noise because it disagreed with the wrong reading. Had this shipped, `--no-hooks` would have carried machinery it didn't need, and the settings copy would have silently broken per-project configuration.
