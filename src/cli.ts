#!/usr/bin/env node
import { realpathSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { collectPluginIds, buildDisablePayload } from './settings.ts';
import { resolvePlugin, type Resolved } from './resolve.ts';
import { isFramework, FRAMEWORKS, frameworkIdsIn, assertManaged } from './frameworks.ts';
import { stagePlugin, type Profile } from './stage.ts';
import { launch } from './launch.ts';
import { listPlugins } from './commands/list.ts';
import { cleanCache } from './commands/cache.ts';
import { addCommand, removeCommand, updateCommand } from './commands/manage.ts';
import { readRegistry, addedNames, isOnboarded, type Source } from './registry.ts';
import { onboard } from './onboarding.ts';
import { isInteractive } from './prompt.ts';
import { UserError, failure, styler, bold, cyan, dim, ARROW } from './ui.ts';

/** Lives in frameworks.ts so `fetch` can refuse identically without a cycle. */
export { assertManaged };

export interface ParsedArgs {
  command: 'run' | 'list' | 'clean' | 'add' | 'remove' | 'update' | 'help' | 'version';
  names: string[];
  profile: Profile;
  force: boolean;
  /** Set by --use-installed / --own; skips the source question in `add`. */
  source?: Source;
  forward: string[];
}

const SUBCOMMANDS = new Set(['list', 'clean', 'add', 'remove', 'update', 'help', 'version']);

export function helpText(): string {
  const { bold: b, dim: d, cyan: c } = styler(process.stdout);
  const heading = (t: string) => b(t);
  // Two columns: the thing you type, then what it does. Padding the term before
  // styling keeps the description column aligned once colour is on.
  const row = (term: string, desc: string) => `  ${b(term.padEnd(15))}${d(desc)}`;
  const example = (cmd: string, desc: string) => `  ${b(cmd.padEnd(38))}${d(desc)}`;

  return `${c(b('exciton'))} ${d('— run Claude Code with an agentic framework dialled to the level you want.')}

${heading('USAGE')}
  ${b('exciton <framework>')} ${d('[--no-hooks] [-- claude-args...]')}
  ${b('exciton <command>')}

${heading('FRAMEWORKS')}
  ${b([...FRAMEWORKS].join(', '))}
${d('  Frameworks are mutually exclusive — name exactly one. Running it silences')}
${d('  any other framework for the session. Ordinary plugins are never touched.')}
${d('  A framework must be added before it will run.')}

${heading('PROFILES')}
${row('(default)', 'the framework exactly as published, hooks and all')}
${row('--no-hooks', 'skills stay callable, nothing auto-fires')}

${heading('COMMANDS')}
${row('add [name]', 'add a framework, choosing which copy it runs from')}
${row('', '  (--use-installed / --own skip the question)')}
${row('remove <name>', 'take a framework back out')}
${row('update [name]', "refresh exciton's own copies to the newest release")}
${row('list', 'what is added, and which plugins auto-fire')}
${row('clean', "empty exciton's cache; refused while a session is using it")}
${row('help', 'this text')}
${row('version', 'print the version')}

${heading('EXAMPLES')}
${example('exciton superpowers --no-hooks', 'skills on the shelf, no ceremony')}
${example('exciton superpowers', 'the full framework, as upstream ships it')}
${example('exciton superpowers --no-hooks -- -c', '...and continue your last session')}
${example('exciton ./my-superpowers-fork', 'a local checkout, by its manifest name')}

${d('exciton manages agentic workflow frameworks and nothing else. Your ordinary')}
${d('plugins — design helpers, language servers, and the rest — keep working exactly')}
${d('as your own settings have them, and nothing under ~/.claude is ever written.')}
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
  let force = false;
  let source: Source | undefined;
  for (const arg of rest) {
    if (arg === '--no-hooks') profile = 'nohooks';
    else if (arg === '--force') force = true;
    else if (arg === '--use-installed') source = 'installed';
    else if (arg === '--own') source = 'own';
    else if (arg === '-h' || arg === '--help') command = 'help';
    else if (arg === '-v' || arg === '--version') command = 'version';
    else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}\nRun \`exciton help\` for usage.`);
    } else names.push(arg);
  }
  return { command, names, profile, force, ...(source ? { source } : {}), forward };
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

/**
 * Managed settings outrank both --settings and --plugin-dir, so a force-enabled
 * framework survives the suppression payload while the staged copy is added
 * alongside it. That session is the precise mixture exciton exists to prevent,
 * and it would arrive looking like success. Refuse rather than deliver it.
 */
export function assertNotEnterpriseLocked(toSuppress: string[], managedIds: string[]): void {
  const locked = toSuppress.filter(id => managedIds.includes(id));
  if (locked.length === 0) return;
  throw new UserError(
    `${locked.join(', ')} is fixed by enterprise-managed settings`,
    [
      'Managed settings outrank every command-line flag, so exciton cannot suppress ' +
      'it for one session.',
      'The session you asked for would run your chosen framework and the pinned one ' +
      'together — the exact mixture exciton exists to prevent — so it is not started. ' +
      'Ask whoever administers this machine, or run `claude` directly.',
    ],
  );
}

/**
 * A framework has to be added before it will run.
 *
 * The refusal names the exact command that fixes it, and says plainly that
 * adding is not a global install — that sentence is the whole reason someone
 * can be asked to run a setup step without feeling ambushed by it.
 */
export function assertAdded(name: string, added: string[]): void {
  if (added.includes(name)) return;
  throw new UserError(`${name} isn't added yet`, [
    `Run  ${bold(`exciton add ${name}`)}  to choose how you want it.`,
    "That isn't a global install. It only affects sessions you start with exciton — " +
    'your ordinary `claude` sessions stay exactly as they are.',
  ]);
}

/** One line, in the shape every other message uses. */
export function runLine(name: string, profile: Profile): string {
  const state = profile === 'nohooks' ? 'no-hooks · nothing auto-fires' : 'hooks active';
  return `  ${cyan(ARROW)}  ${bold(name)} ${dim(`· ${state}`)}`;
}

export function run(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.command === 'help') { process.stdout.write(helpText()); return 0; }
  if (parsed.command === 'version') { process.stdout.write(`${versionText()}\n`); return 0; }

  // First contact: walk through what exciton is before doing anything else.
  // Skipped without a terminal, where no answer could ever arrive.
  if (!isOnboarded(readRegistry()) && isInteractive() && parsed.command !== 'add') {
    onboard();
    // A bare `exciton` that just ran the walkthrough is finished. Falling
    // through would answer the walkthrough with "name a framework to run",
    // which reads as a rebuke for having followed it.
    if (parsed.command === 'run' && parsed.names.length === 0) return 0;
  }

  if (parsed.command === 'add') {
    return addCommand(parsed.names, {}, parsed.source ? { source: parsed.source } : {});
  }
  if (parsed.command === 'remove') return removeCommand(parsed.names);
  if (parsed.command === 'update') return updateCommand(parsed.names);
  if (parsed.command === 'list') return listPlugins(process.cwd());
  if (parsed.command === 'clean') return cleanCache({ force: parsed.force });

  // Naming nothing would launch a session identical to plain `claude`, which
  // is a reason to type `claude`, not `exciton`. Treat it as a usage error.
  if (parsed.names.length === 0) {
    const added = addedNames(readRegistry());
    process.stderr.write(failure('Name a framework to run', [
      added.length > 0
        ? `You have ${added.join(', ')} added.  Try  ${bold(`exciton ${added[0]} --no-hooks`)}`
        : `Nothing is added yet.  Start with  ${bold('exciton add')}`,
      dim('Run `exciton help` for the full usage.'),
    ]));
    return 1;
  }

  // The registry decides which copy runs: resolving installed-first regardless
  // would silently ignore a deliberate choice of `own`.
  const registry = readRegistry();
  const resolved = parsed.names.map(name => resolvePlugin(
    name, {}, { ownCopy: registry.frameworks[name.split('@')[0]]?.source === 'own' },
  ));
  assertManaged(resolved);
  assertSingleFramework(resolved);

  const added = addedNames(registry);
  for (const r of resolved) assertAdded(r.name, added);

  // Suppress every managed framework — including ones not named, which would
  // otherwise keep governing the session — then add the named one back via
  // --plugin-dir. Ordinary plugin ids never enter the payload at all, so the
  // user's own settings continue to govern them.
  const { ids, managedIds } = collectPluginIds(process.cwd());
  const toSuppress = frameworkIdsIn(ids);

  assertNotEnterpriseLocked(toSuppress, managedIds);

  const pluginDirs = resolved.map(r => stagePlugin(r, parsed.profile));

  // The last line before claude takes the terminal, and the only confirmation
  // that the session is the one that was asked for — so it states the profile
  // in both directions rather than staying silent on the default.
  const summary = resolved.map(r => r.name).join(', ');
  process.stderr.write(`${runLine(summary, parsed.profile)}\n`);

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
    // Errors carry their own presentation; anything else is unexpected, and
    // dressing it up as a considered refusal would be a lie.
    process.stderr.write(err instanceof UserError
      ? err.render()
      : failure((err as Error).message));
    process.exit(1);
  }
}
