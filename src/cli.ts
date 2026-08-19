#!/usr/bin/env node
import { realpathSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { collectPluginIds, buildDisablePayload } from './settings.ts';
import { resolvePlugin, type Resolved } from './resolve.ts';
import { isFramework, FRAMEWORKS, frameworkIdsIn } from './frameworks.ts';
import { stagePlugin, type Profile } from './stage.ts';
import { launch } from './launch.ts';
import { listPlugins } from './commands/list.ts';
import { cleanCache, prefetch } from './commands/cache.ts';

export interface ParsedArgs {
  command: 'run' | 'list' | 'clean' | 'fetch' | 'help' | 'version';
  names: string[];
  profile: Profile;
  forward: string[];
}

const SUBCOMMANDS = new Set(['list', 'clean', 'fetch', 'help', 'version']);

export function helpText(): string {
  return `exciton — run Claude Code with an agentic framework dialled to the level you want.

USAGE
  exciton <framework> [--no-hooks] [-- claude-args...]
  exciton <command>

FRAMEWORKS
  ${[...FRAMEWORKS].join(', ')}
  Frameworks are mutually exclusive — name exactly one. Running it silences
  any other framework for the session. Ordinary plugins are never touched.

PROFILES
  (default)      the framework exactly as published, hooks and all
  --no-hooks     skills stay callable, nothing auto-fires

COMMANDS
  list           installed plugins, and which ones auto-fire
  fetch <name>   warm the cache so a later run is instant and works offline
  clean          empty exciton's cache
  help           this text
  version        print the version

EXAMPLES
  exciton superpowers --no-hooks            skills on the shelf, no ceremony
  exciton superpowers                       the full framework, as upstream ships it
  exciton superpowers --no-hooks -- -c      ...and continue your last session
  exciton ./my-superpowers-fork             a local checkout, judged by its manifest

exciton manages agentic workflow frameworks and nothing else. Your ordinary
plugins — design helpers, language servers, and the rest — keep working exactly
as your own settings have them, and nothing under ~/.claude is ever written.
`;
}

export function versionText(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return String(pkg.version ?? '0.0.0');
  } catch {
    return '0.0.0';
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const sep = argv.indexOf('--');
  const own = sep === -1 ? argv : argv.slice(0, sep);
  const forward = sep === -1 ? [] : argv.slice(sep + 1);

  let command: ParsedArgs['command'] = 'run';
  let rest = own;
  if (own.length > 0 && SUBCOMMANDS.has(own[0])) {
    command = own[0] as ParsedArgs['command'];
    rest = own.slice(1);
  }

  const names: string[] = [];
  let profile: Profile = 'full';
  for (const arg of rest) {
    if (arg === '--no-hooks') profile = 'nohooks';
    else if (arg === '-h' || arg === '--help') command = 'help';
    else if (arg === '-v' || arg === '--version') command = 'version';
    else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}\nRun \`exciton help\` for usage.`);
    } else names.push(arg);
  }
  return { command, names, profile, forward };
}

/**
 * exciton dials agentic workflow frameworks. Refusing anything else is the
 * point, not a limitation: an ordinary plugin is already doing what its owner
 * configured, and exciton has no business overriding it.
 */
export function assertManaged(resolved: Resolved[]): void {
  const strays = resolved.filter(r => !isFramework(r.name)).map(r => r.name);
  if (strays.length === 0) return;
  throw new Error(
    `exciton does not manage ${strays.join(', ')}.\n` +
    `It manages agentic workflow frameworks — currently ${[...FRAMEWORKS].join(', ')} — ` +
    `because those compete to define how a session is conducted.\n` +
    `${strays.length > 1 ? 'Those add capabilities' : 'That adds a capability'} rather than ` +
    `competing, so ${strays.length > 1 ? 'they keep' : 'it keeps'} working exactly as your ` +
    `settings already have it. There is nothing to name here.`,
  );
}

/**
 * Frameworks compete to govern a session; two at once is the mixture exciton
 * exists to prevent. Refuse rather than stage both.
 */
export function assertSingleFramework(
  resolved: Resolved[],
  managed: (name: string) => boolean = isFramework,
): void {
  const named = resolved.filter(r => managed(r.name)).map(r => r.name);
  if (named.length <= 1) return;

  const distinct = [...new Set(named)];
  if (distinct.length === 1) {
    throw new Error(
      `you named ${distinct[0]} more than once. Run one copy of it — if you meant ` +
      `a local checkout instead of the installed copy, name only the path.`,
    );
  }
  throw new Error(
    `cannot run ${distinct.join(' and ')} together.\n` +
    `Agentic frameworks each define how a session is conducted, so they are ` +
    `mutually exclusive — run one at a time.`,
  );
}

export function run(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.command === 'help') { process.stdout.write(helpText()); return 0; }
  if (parsed.command === 'version') { process.stdout.write(`${versionText()}\n`); return 0; }
  if (parsed.command === 'list') return listPlugins(process.cwd());
  if (parsed.command === 'clean') return cleanCache();
  if (parsed.command === 'fetch') return prefetch(parsed.names);

  // Naming nothing would launch a session identical to plain `claude`, which
  // is a reason to type `claude`, not `exciton`. Treat it as a usage error.
  if (parsed.names.length === 0) {
    process.stderr.write(`exciton: name a framework to run.\n\n${helpText()}`);
    return 1;
  }

  const resolved = parsed.names.map(name => resolvePlugin(name));
  assertManaged(resolved);
  assertSingleFramework(resolved);

  // Suppress every managed framework — including ones not named, which would
  // otherwise keep governing the session — then add the named one back via
  // --plugin-dir. Ordinary plugin ids never enter the payload at all, so the
  // user's own settings continue to govern them.
  const { ids, managedIds } = collectPluginIds(process.cwd());
  const toSuppress = frameworkIdsIn(ids);

  const clash = toSuppress.filter(id => managedIds.includes(id));
  if (clash.length > 0) {
    process.stderr.write(
      `exciton: ${clash.join(', ')} is fixed by enterprise-managed settings ` +
      `and cannot be changed for a session\n`,
    );
  }

  const pluginDirs = resolved.map(r => stagePlugin(r, parsed.profile));

  const summary = resolved.map(r => r.name).join(', ');
  process.stderr.write(
    `exciton: ${summary}${parsed.profile === 'nohooks' ? ' · no-hooks' : ''}\n`,
  );

  const disablePayload = toSuppress.length > 0 ? buildDisablePayload(toSuppress) : '';
  return launch({ disablePayload, pluginDirs, forward: parsed.forward });
}

/**
 * npm installs bins as symlinks, so argv[1] is the symlink path while
 * import.meta.url is the realpath. Comparing them raw leaves `exciton` doing
 * nothing at all. Resolve both sides, and encode via pathToFileURL so paths
 * containing spaces still compare equal.
 */
export function isMainModule(metaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write(`exciton: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
