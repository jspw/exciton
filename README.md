# exciton

**Run Claude Code with an agentic framework dialled to the level the task deserves — for one session, without changing anything else.**

```sh
npm i -g exciton

exciton superpowers --no-hooks   # skills stay callable, nothing auto-fires
exciton superpowers              # the full framework, exactly as upstream ships it
```

An *exciton* is a bound electron–hole pair: it exists only while the system is excited, only inside the medium, and when it recombines the material is exactly as it was. That is what this does — a configuration that lives for one session and leaves your setup untouched.

---

## The problem

Agentic frameworks like [superpowers](https://github.com/obra/superpowers) install once, globally, and then govern **every** session. Claude Code plugins [install enabled by default](https://code.claude.com/docs/en/plugins-reference), and there is no supported per-session dial. So a three-line settled bug fix gets the same design → spec → approval pipeline as a new subsystem.

superpowers' [issue #645](https://github.com/obra/superpowers/issues/645) asked for exactly this — an explicit mode that skips injection but keeps skills callable. It was closed without implementation.

`exciton superpowers --no-hooks` is that feature, from outside, without forking anything.

## Usage

```
exciton <framework> [--no-hooks] [-- claude-args...]
exciton <command>

PROFILES
  (default)      the framework exactly as published, hooks and all
  --no-hooks     skills stay callable, nothing auto-fires

COMMANDS
  list           installed plugins, and which ones auto-fire
  fetch <name>   warm the cache so a later run is instant and works offline
  clean          empty exciton's cache
  help, version

EXAMPLES
  exciton superpowers --no-hooks            skills on the shelf, no ceremony
  exciton superpowers --no-hooks -- -c      ...and continue your last session
  exciton superpowers@6.2.0                 a pinned ref
  exciton ./my-superpowers-fork             a local checkout, judged by its manifest
```

`xc` is installed as a short alias for the same binary.

## What it touches, and what it doesn't

exciton manages **agentic workflow frameworks** — the things that define *how a session is conducted*. It never touches ordinary plugins.

|  | Frameworks | Ordinary plugins |
|---|---|---|
| Examples | superpowers, BMAD, Spec Kit | design helpers, language servers, MCP integrations |
| What they do | define how the session is conducted | add a capability |
| To each other | **mutually exclusive** — two of them fight over the same job | **compose freely** |
| exciton's stance | dials the one you name, silences the rest | never touches them |

Consequences: naming two frameworks is refused, naming an ordinary plugin is refused, and a bare `exciton` with no framework is a usage error — it would launch a session identical to plain `claude`.

## How it works

Two documented Claude Code primitives, nothing else:

| Primitive | Effect |
|---|---|
| `--settings '{"enabledPlugins":{"<id>":false}}'` | removes a plugin entirely for one session |
| `--plugin-dir <dir>` | adds a plugin for one session, from a directory you control |

For `--no-hooks`, exciton stages a copy of the framework with its `hooks/` directory omitted. Hooks are discovered by convention, so removing the directory leaves nothing dangling — the skills remain, and nothing pushes them into the conversation.

**Nothing under `~/.claude` is ever written.** exciton reads your Claude Code configuration and writes only inside `~/.exciton/`. It never runs `claude plugin install`, because installing a plugin enables it globally — the exact problem this exists to avoid. Quit exciton, run `claude`, and it behaves as it always did.

Full detail, including the verification log: [MECHANISM.md](MECHANISM.md).

## Requirements

- Node ≥ 22.18 (running the tests needs the unflagged TypeScript stripping added there)
- Claude Code on your `PATH`
- macOS or Linux (Windows is not supported)
- `git`, for fetching a framework you don't already have installed

## Status

Early. The mechanism is documented by Anthropic and cross-verified by an integration suite that asserts against Claude Code's own debug output; the CLI around it is young. Expect rough edges, and please open an issue rather than working around them silently.

```sh
npm test              # unit tests
npm run test:integration   # asserts real Claude Code behaviour; needs claude installed
```

## Documentation

| | |
|---|---|
| [PRODUCT.md](PRODUCT.md) | what it is, who it's for, scope and risks |
| [MECHANISM.md](MECHANISM.md) | how it works, and the evidence for every claim |
| [QA.md](QA.md) | questions, answers, and the reasoning behind each decision |
| [PROBLEM.md](PROBLEM.md) | the validated problem this addresses |
| [PLAN.md](PLAN.md) | the implementation plan |

## License

MIT
