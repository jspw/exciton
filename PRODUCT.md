# EXCITON — Product Definition

**Status:** Product definition — 2026-08-15 (revised after documentation research; supersedes the 2026-08-14 draft). Supersedes [PRODUCT-1-SESSION-LOADER.md](PRODUCT-1-SESSION-LOADER.md), kept for its problem framing and history.
**Companions:** [MECHANISM.md](MECHANISM.md) (how it works) · [QA.md](QA.md) (questions and answers)

**Evidence legend:** 📄 documented by Anthropic · ✅ documented *and* cross-verified here (Claude Code 2.1.232, superpowers 6.3.0, macOS, 2026-08-15 — one machine, one version) · ❓ inferred, unverified

---

## One line

**Run an agentic framework at the intensity this task deserves — for one session, without changing anything else.**

> **Revised 2026-08-16.** The previous one-liner was *"your Claude session's plugin set is exactly what you name on the command line — and nothing else."* That promised an allow-list over your whole plugin set, and it was built that way before being rejected in testing. exciton dials **frameworks**; it leaves every other plugin exactly as your settings have it. See [§ Scope](#scope-what-exciton-touches).

---

## The name

`exciton`, with `xc` as the short alias.

An **exciton** is a bound electron–hole pair in a material: it exists only while the system is excited, only inside the medium, and when it recombines the material is exactly as it was. That is this product in one word — a configuration that exists only for the duration of a session, only inside Claude Code, leaving your setup untouched when it ends.

The `--no-hooks` profile has a matching reading: the framework is fully present but unbound, carrying no energy anywhere.

Earlier names and why they were dropped: `lesspowers` described an intensity dial the product outgrew; `loadout` shared a search term with two abandoned Claude Code config tools; `golem`, though the best story, collides directly with a 1,549★ AI-agent platform and an npm `golem-cli` that is itself an AI coding assistant.

**Availability** ✅ (checked 2026-08-19):

| | Status |
|---|---|
| npm `exciton` | **free** — the bare name, no scope needed |
| `exciton` and `xc` as shell commands | free — no POSIX collision |
| Homebrew formula `exciton` | free |
| GitHub repos named `exciton` | **162** — the cleanest namespace of every candidate evaluated |

For comparison: `loadout` 1,448 repos, `golem` 3,023, `proteus` 4,080. Note that npm `xc` is taken, so the short alias ships as a bin inside the `exciton` package rather than as a package of its own.

---

## The problem

Every agentic framework — superpowers, BMAD, SuperClaude, Spec Kit, OpenSpec — assumes **you install it once, globally, and it governs everything from then on.**

1. **Unconditional influence.** Superpowers' `SessionStart` hook fires in every session regardless of task ✅. A 3-line settled fix gets the same design → spec → approval pipeline as a new subsystem. See [PROBLEM.md](PROBLEM.md).
2. **Mutual exclusivity.** You cannot run superpowers and BMAD side by side to compare them on the same work.
3. **High evaluation cost.** Assessing a framework means install → configure → live with it → uninstall.
4. **No per-task fit.** [WORKFLOWS.md](WORKFLOWS.md) shows work types differ enough that no single configuration fits them all.

**The framing that matters:** this is not "superpowers is too aggressive" — that's one symptom, fixable upstream at any time. The durable problem is that **plugin activation is permanent and global when it should be per-session**, and that worsens as more frameworks ship.

Claude Code's own default reinforces it: **plugins install enabled by default** 📄, changeable only by the plugin author. There is no supported per-session dial.

**What upstream refused:** [issue #645](https://github.com/obra/superpowers/issues/645) asked for `SUPERPOWERS_MODE=explicit` — skip injection, keep skills callable. Closed without implementation. `exciton superpowers --no-hooks` is that feature, delivered from outside ✅.

---

## Who it's for

1. **The mixed-workload developer.** Serious features some days, pet projects and quick fixes on others.
2. **The framework-curious developer.** Wants to evaluate BMAD vs. superpowers vs. Spec Kit without committing their machine.
3. **The budget-conscious user.** Ceremony on trivial tasks burns real quota ([WORKFLOWS.md §3, Finding C](WORKFLOWS.md)).

All three share one property that shaped the design: **they already have at least one framework installed globally.** A solution that only works on a clean machine solves nothing for them.

---

## What it does

```
exciton superpowers                # exactly upstream superpowers, this session only
exciton superpowers --no-hooks     # skills callable by name; nothing auto-fires
exciton ./path/to/plugin           # a local checkout, judged by its manifest name
exciton superpowers@claude-plugins-official  # the full plugin id also works
exciton superpowers -- --model opus  # everything after `--` goes to claude

exciton add [name]                 # add a framework; --use-installed / --own skip the question
exciton remove <name>              # take one back out
exciton update [name]              # refresh exciton's own copies to the newest release
exciton list                       # what's added, what's available, what auto-fires
exciton clean                      # prune staged trees; --force overrides the live-session guard
exciton help                       # usage; also -h / --help
exciton version                    # also -v / --version
```

Session ends → nothing persists. The next `claude` is exactly as it was ✅.

**A framework must be added before it runs.** `exciton superpowers` on a machine where it has not been added exits 1 and names the command that fixes it, saying plainly that adding is not a global install. The registry lives in `~/.exciton/config.json`; `onboardedAt` in that file is what distinguishes "never onboarded" from "onboarded and deliberately added nothing", so opting out sticks.

**First contact runs a walkthrough.** On the first invocation with no config — and only with a terminal attached — exciton explains the problem it solves, shows which frameworks are already installed through Claude, and lets the user add zero, one, or several. npm `postinstall` is the wrong hook for this: npm runs lifecycle scripts non-interactively and often under `--ignore-scripts`, so prompting there either hangs or is suppressed.

**A framework name is required — once you are set up.** After onboarding, bare `exciton` is a usage error that prints help and exits 1: with nothing named it would suppress nothing and launch a session byte-identical to plain `claude`, which is a reason to type `claude`. Before onboarding, bare `exciton` is the walkthrough — the one case where naming nothing has something to say. (An earlier draft made bare `exciton` mean "zero plugins"; that followed from the superseded allow-list design.)

**Naming a plugin exciton does not manage is refused.** `exciton warp` exits 1 and explains that warp already works exactly as your settings have it, so there is nothing to name.

### `exciton list` earns its place

There is no built-in way to see which installed plugins inject into every session:

```
FRAMEWORKS — exciton runs one of these per session
  NAME         ADDED                 VERSION    AUTO-FIRES
  superpowers  yes (Claude's copy)   6.3.0      SessionStart

  Run: exciton superpowers [--no-hooks]

OTHER PLUGINS — untouched; your own settings govern these
  NAME                 VERSION    ENABLED  AUTO-FIRES
  frontend-design      unknown    yes      —
  swift-lsp            1.0.0      yes      —
  ui-ux-pro-max        2.6.2      yes      —
  understand-anything  2.6.0      yes      SessionStart
  warp                 2.1.0      yes      SessionStart
```

`exciton list` answers two questions at once, which is why it reports **every** installed plugin rather than only managed frameworks:

- **What injects into my session?** The `AUTO-FIRES` column, across both sections — including the plugins exciton will never touch. It reflects whether the plugin ships a `hooks/hooks.json` at all; naming the specific events is a later refinement.
- **What can I type?** The `FRAMEWORKS` section. Without it the output is informative but not actionable: `resolve.ts` tells a user who mistyped a name to "check the name with `exciton list`", and that is only honest if the output names what exciton actually accepts.

The split is the [scope distinction](#the-distinction-the-product-rests-on) made visible. A framework exciton supports but you have never installed still appears, marked `—`, because `exciton add <name>` fetches it on demand — so the section is the runnable set, not the installed subset of it. The `ADDED` column is what decides whether a name will actually run.

---

## Scope: what exciton touches

**exciton is a manager for agentic workflow frameworks. It touches frameworks. Nothing else. Ever.**

### The distinction the product rests on

| | **Frameworks** | **Ordinary plugins** |
|---|---|---|
| Examples | superpowers, BMAD, SuperClaude, Spec Kit | frontend-design, ui-ux-pro-max, understand-anything, swift-lsp |
| What they do | define **how the session is conducted** — process, ceremony, when to plan vs. act | add a **capability** in one domain |
| Relationship to each other | **mutually exclusive** — two of them fight over the same job | **compose freely** — any number can be active |
| exciton's stance | manages them: suppress all, enable the one you chose | never touches them |

superpowers setting the strategy while frontend-design handles the design work **is a good session**, not a conflict. That is why exciton leaves ordinary plugins alone. superpowers *and* Spec Kit both trying to define how you approach the work **is** the conflict — and it is the whole reason this tool exists.

### Consequences

- **Running a framework silences every other framework**, named or not. `exciton spec-kit` must suppress a globally-enabled superpowers too, or you get exactly the mixture you came here to avoid.
- **Naming two frameworks is refused.** `exciton superpowers spec-kit` exits 1: they are mutually exclusive by nature, so run one at a time.
- **Naming an ordinary plugin is refused.** `exciton frontend-design` exits 1 — it already works, and stopping it would serve no purpose.

| | Behavior |
|---|---|
| The framework you named | suppressed globally for the session, re-added in the profile you chose |
| Every **other framework** | suppressed for the session — they compete for the same job |
| Every **ordinary plugin** | **untouched** — its id never enters the `--settings` payload, so your own settings still govern it |
| Your personal skills (`~/.claude/skills/`) | untouched |
| Built-in Claude Code skills and commands | untouched |
| Your `CLAUDE.md`, global and project | untouched |
| Anything under `~/.claude/` | never written ✅ |

The managed set is an explicit list in `src/frameworks.ts`, currently `{superpowers}`. Widening it is a deliberate act: each addition needs a staging profile known to work for that framework's layout.

**Why not an allow-list over everything?** Because that solves a problem nobody has. The problem is that *frameworks* install once and then govern every session; `ui-ux-pro-max` sitting installed is not that problem. `frontend-design` is not a competitor of superpowers — it is a collaborator, applying to the design work while superpowers sets the approach. Suppressing it would break a session the user deliberately assembled, for no benefit. This was built the other way first and rejected on contact with real use.

The allow-list is real, but its universe is the framework set — not your plugin list.

**v1 — superpowers first, built for extension.** The mechanism is framework-agnostic by construction ([MECHANISM.md](MECHANISM.md) § Extension seam), but v1 is validated and tested against superpowers only.

| Framework | Shape | Status |
|---|---|---|
| superpowers | plugin at repo root (`hooks/`, `skills/`) | ✅ verified end-to-end |
| BMAD | `.claude-plugin/marketplace.json` | 📄 loads via subpath (verified 2026-08-07, not re-tested) — **not yet in `FRAMEWORKS`** |
| SuperClaude | `plugins/superclaude/` | 📄 loads via subpath (verified 2026-08-07, not re-tested) — **not yet in `FRAMEWORKS`** |
| ordinary plugins (linters, design helpers, LSPs) | — | **out of scope by design**, not a gap |

**Out of scope — scaffolder-shaped frameworks.** Spec Kit and OpenSpec write `.specify/` or equivalent **into your repo**; "session-only" means something different for them. **Do not promise "any framework" until this is solved.**

**Out of scope — Windows.** POSIX (macOS + Linux) for v1, by decision.

**Out of scope — enterprise-managed setups.** `--plugin-dir` cannot override plugins that managed settings force-enable or force-disable 📄. exciton detects this and **refuses, exiting 1**. Warning and launching anyway was rejected: managed settings outrank the suppression payload, so the framework stays enabled *and* the staged copy is added beside it — the exact mixture the tool exists to prevent, arriving under the appearance of success. A session that cannot be delivered is not delivered.

---

## Non-goals

- **Installing anything into Claude's plugin registry.** Plugins install **enabled by default** 📄, so installing superpowers would activate it in every ordinary `claude` session and in the VS Code extension — reproducing the exact problem this product removes. exciton fetches into its own cache instead.

`exciton add` is **not** an install command, and the distinction is the product. `claude plugin install` writes to `~/.claude` and enables a plugin in every session; `exciton add` records a choice in `~/.exciton/config.json` and changes nothing about how `claude` behaves. The onboarding says so in as many words, because someone asked to run a setup step deserves to know it costs them nothing globally.
- **Modifying Claude's state.** exciton reads Claude's configuration and writes only inside `~/.exciton/` ✅.
- **Modifying framework content.** Upstream's material is good; this product has no opinion about methodology. That belongs to [PRODUCT-2](PRODUCT-2-WORKFLOW-MODES.md).
- **Fighting prompts with prompts.** Suppression is by configuration, never persuasion.
- **Replacing global installation for people who like it.** Someone who wants superpowers always-on is already served.

---

## What is verified

Every mechanism claim now rests on Anthropic's documentation, cross-verified by measurement (9 tests, all passing — [MECHANISM.md](MECHANISM.md) § Testing):

- `--plugin-dir` loads a plugin for one session and **does not modify any settings files** 📄 ✅
- A same-named `--plugin-dir` copy **takes precedence** over the installed plugin; precedence is keyed on the plugin's `name` 📄 ✅
- `enabledPlugins: {"<id>": false}` disables a plugin entirely; `--settings` outranks user, project, and local 📄 ✅
- Hooks are discovered by convention at `hooks/hooks.json`; omitting the directory leaves no dangling reference 📄 ✅
- superpowers ships **zero commands and zero agents** — its whole surface is 14 skills plus one `SessionStart` hook ✅
- The two production invocations behave exactly as specified ✅

---

## Risks

| Risk | Severity | Notes |
|---|---|---|
| **CLI surface stability** | **Medium** | Depends on four **documented** behaviors: `--plugin-dir`, `--settings`, `enabledPlugins: false`, and settings precedence. Documented ≠ frozen, but this is a supported API rather than observed internals. The regression suite fails loudly on change. |
| **Thin product** | **Medium** | A few hundred lines. Defensible because the correct mechanism is non-obvious — the first three plausible approaches all fail, two of them silently. |
| **Upstream closes the gap** | **Low–Medium** | If superpowers ships `SUPERPOWERS_MODE`, single-framework value drops. The general plugin-set value survives. |
| **Multi-scope enumeration** | **Low–Medium** | Plugin ids must be gathered from user, project, *and* local settings. Missing a scope silently leaves a plugin enabled. Test coverage required. |
| **Managed settings** | **Low** | Enterprise-managed enable/disable cannot be overridden 📄. Detect and report; do not pretend to work. |
| **Scaffolder frameworks never fit** | **Low** | Caps the "any framework" claim at roughly half the landscape. |

**Change from the previous draft:** the earlier **High** risk — "depends on three undocumented behaviors" — is withdrawn. It was an artifact of a wrong mechanism derived without consulting the documentation. The corrected design rests on documented API.

---

## Why this is worth building

- The problem is **externally validated** — [PROBLEM.md](PROBLEM.md): issue #645 closed unimplemented, token-cost complaints, the settled-fix pain case.
- The mechanism is **documented and cross-verified**, with a regression suite that guards it.
- It **takes no position on methodology**, so it cannot be wrong about one.
- It is **small**: two documented flags and a file copy.
- Every framework in the landscape assumes permanent installation. **Nobody occupies this position.**

---

## Open questions

1. ~~**v1 boundary.**~~ **Resolved:** the fetch path shipped. Marketplace-resolved cloning is what delivers *"run a framework you never installed"*, and the marketplace manifest does the hard part. It is now the `--own` source.
2. **Implementation language and distribution.** `exciton` on npm is the low-friction path (the audience provably has node; `npx exciton superpowers` works with zero install). Alternative: a single Go/Rust binary via the free Homebrew formula.
3. **`command`-source plugins** ❓ — cannot be fetched by clone. Detect and fail loudly; confirm how common they are.
4. **Banner output.** One stderr line per launch, or silent by default?
