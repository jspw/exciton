# PROBLEM

**Status:** Draft, under discussion — 2026-08-05
**This document defines the problem only. Solutions live elsewhere and must not leak in here.**

## Problem statement

The [superpowers](https://github.com/obra/superpowers) plugin for Claude Code contains a genuinely good software-development methodology, but it ships with exactly one intensity setting — maximum, always, for every task in every session — and there is no supported way to keep the methodology while choosing when it applies.

## How the forcing works (verified against superpowers 6.2.0)

Three mechanisms, layered. They reinforce each other but differ in kind — which matters, because they are not all defeated the same way:

1. **SessionStart hook injection — deterministic.** `hooks/hooks.json` injects the full `using-superpowers` skill into every session wrapped in `<EXTREMELY_IMPORTANT>`: *"If you think there is even a 1% chance a skill might apply... you ABSOLUTELY MUST invoke the skill. This is not negotiable."* Includes a "Red Flags" table pre-rebutting every reason to skip. This one always happens; nothing about the task can prevent it.
2. **Self-triggering skill descriptions — probabilistic.** Even with the hook removed, descriptions like brainstorming's *"You MUST use before any creative work"* and systematic-debugging's *"Use when encountering any bug"* sit in the model's tool list every turn and bias selection toward firing. Strong pressure, not a guarantee.
3. **Hard gates inside skills — conditional.** `brainstorming` carries a `<HARD-GATE>`: no code, no scaffolding until a design is presented and approved, *"regardless of perceived simplicity."* This binds only *after* a skill is loaded; it enforces ceremony rather than initiating it.

The practical consequence: (1) is the only one that must be defeated at the infrastructure level. (2) and (3) have no effect at all if the skill content was never loaded into the session.

## The pain, concretely

Cases where the forced maximum is wrong (experienced firsthand):

- **The settled fix.** A bug was diagnosed and the fix agreed in conversation. Superpowers still demands design → spec → approval before a 3-line change.
- **The pet project.** Building an idea for fun. Full spec-driven ceremony, adversarial review, and TDD are explicitly unwanted — e.g. "build this without unit tests" is a legitimate choice the harness fights.
- **The quick question.** Even clarifying questions are gated: skill invocation is mandated *"before ANY response including clarifying questions."*

The methodology itself is **not** the problem. Brainstorming for real features and systematic-debugging for nasty bugs are wanted. The problem is that intensity is unconditional.

## Is this a real problem for other people? Yes.

- **The exact feature was requested upstream and not delivered.** [Issue #645](https://github.com/obra/superpowers/issues/645) (filed by jottr, 2026-03-06) asks for a `SUPERPOWERS_MODE=explicit` that skips injection while keeping slash commands. **Closed without implementation** — no PR, no `SUPERPOWERS_MODE` anywhere in 6.2.0's hooks or release notes.
- **Always-on is a deliberate default, not an oversight.** The 6.x release notes require an acceptance test for new harness integrations: *"'Let's make a react todo list' must auto-trigger brainstorming in a clean session."* Note the limit of this evidence: the test constrains **default** behavior, so it would not be violated by an opt-in flag. It shows always-on is intentional; it does **not** prove upstream would refuse an explicit mode. The evidence that they haven't is simply that #645 was closed unimplemented and no such switch exists in 6.2.0.
- **The workaround upstream leaves users is hand-editing.** Those wanting explicit activation must edit `hooks/session-start` themselves and redo it after every update.
- **Recurring criticism — "bloated, not wrong."** Per [MCP.Directory's 2026 analysis](https://mcp.directory/blog/superpowers-skill-worth-it-2026), a frequently-voiced criticism disputes *"paying tokens for harness on models that plan competently unprompted"* — one widely-upvoted Reddit comment: *"For me superpowers are a bit bloated... But the workflow estabilished is good."* This is a vocal segment, not a measured consensus; the evidence below is anecdotal and should be read that way.
- **"Overkill by design" for small tasks.** [joanmedia.dev's tradeoffs analysis](https://www.joanmedia.dev/ai-blog/the-honest-tradeoffs-of-superpowers-token-costs-overkill-and-the-alternatives) collects reports: *"burned through all my max plan"* on straightforward tasks; simple fixes *"take literally an hour with all the verification."*
- **[Hacker News](https://news.ycombinator.com/item?id=47623101) (25 comments, mixed):** deaux: *"Superpowers isn't the ideal solution because it too lacks flexibility"*; d--b reports more mistakes with it than without; others prefer lighter manual workflows.
- **The most telling signal:** critics don't abandon it. The Reddit OP re-enabled it within a day; the heaviest users fork it rather than delete it. People want the workflow — with control over when it fires.

## Who has this problem

1. **The solo developer with mixed workloads** (us): serious features some days, pet projects and quick fixes on others. One global install cannot serve both.
2. **The experienced developer** who wants to cherry-pick — advised today to hand-copy skill files, losing updates.
3. **The budget-conscious user** for whom ceremony on trivial tasks burns real quota.

## Constraints on any solution

- **Must stay current with upstream automatically.** Skill content evolves; whatever we do must track it without manual work per release. (This is a requirement about *staying in sync*, not a ban on any particular mechanism — vendoring, overlays, and live references are all still on the table.)
- **Must work on a stranger's machine.** This is intended for publication, not just local use.
- **Must not degrade the maximum setting.** One available behavior must be *exactly* what superpowers does today — the full methodology is valued, not tolerated.
- **Must keep the surface small.** Upstream itself deleted `/brainstorm`, `/execute-plan`, and `/write-plan` in 6.x as *"deprecated stubs that did nothing but tell the user to invoke the corresponding skill"* (RELEASE-NOTES line 186). Any command we add must do real work that invoking the skill directly cannot.
- **Deterministic over persuasive.** Fighting an `<EXTREMELY_IMPORTANT>` injection with more prompt text is probabilistic; a real solution controls what loads, not what the model is told.

## What "solved" looks like

A developer can choose, per session, the process intensity they get — from "plain Claude, methodology available only when explicitly summoned" to "exactly superpowers today" — without fighting injected prompts, and without re-doing any manual step after an upstream release.

## What is already possible without us

Honesty requires stating this, because it bounds the real gap. Claude Code already supports per-session settings overrides and project/local plugin enablement, so **turning superpowers wholly on or wholly off is substantially available today**. `--bare` even skips hooks while keeping skills resolvable by name — though it also disables CLAUDE.md discovery, auto-memory, and OAuth/keychain auth, so subscription users cannot use it.

What is **not** cleanly available is the combination: *suppress superpowers' automatic influence while keeping its individual skills explicitly callable.* That combination is the actual gap. (Status: the precise limits of per-session plugin overrides are asserted from documentation, not yet verified by experiment.)

## Non-goals

- Rewriting or improving the skill *content*. Upstream's material is good; "bloated, not wrong."
- Competing with superpowers for users who love always-on. They're served already.
- Prompt-engineering workarounds ("just tell it to skip planning") — probabilistic, and loses to the injection.

## Open questions

- How few modes can we get away with? (Two are certain: *full superpowers* and *plain-Claude-plus-explicit-invocation*. Is a third needed, or is that scope creep?)
- Is intensity a property of the **project**, the **session**, or both?
- Mid-session escalation: needed for v1, or later?
- Should skill *sourcing* stay upstream (superpowers as a dependency) or be vendored? What does each mean for a stranger's install?
