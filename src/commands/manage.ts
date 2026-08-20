import { readRegistry, writeRegistry, addFramework, removeFramework, isAdded, addedNames,
  isOnboarded, markOnboarded, type Registry, type Source } from '../registry.ts';
import { FRAMEWORKS, isFramework, unmanagedError } from '../frameworks.ts';
import { findInstalled, type InstalledPlugin } from '../installed.ts';
import { resolvePlugin } from '../resolve.ts';
import { stagePlugin } from '../stage.ts';
import { isInteractive, select } from '../prompt.ts';
import { bold, dim, note, success, failure, UserError } from '../ui.ts';

export interface ManageDeps {
  read: () => Registry;
  save: (reg: Registry) => void;
  findInstalled: (name: string) => InstalledPlugin | undefined;
  /** Downloads and stages exciton's own copy, returning where it landed. */
  fetch: (name: string) => string;
  chooseSource: (name: string, installedVersion: string) => Source;
  interactive: () => boolean;
}

export interface AddOptions {
  /** Set by --use-installed / --own, which skip the question entirely. */
  source?: Source;
}

/** Always exciton's own clone: this only ever runs for `source: own`. */
function realFetch(name: string): string {
  return stagePlugin(resolvePlugin(name, {}, { ownCopy: true }), 'nohooks');
}

/**
 * The one place this question is asked.
 *
 * It was written twice — here and in onboarding — with wording that had already
 * drifted apart. Same decision, one text.
 */
export function askSource(name: string, installedVersion: string): Source {
  return select(`Which copy of ${name} should exciton run?`, [
    {
      value: 'installed',
      label: "Claude's copy",
      hint: `${installedVersion}, already on disk · Claude keeps it current`,
    },
    {
      value: 'own',
      label: 'An exciton copy',
      hint: 'independent of Claude · updated by `exciton update`',
    },
  ]) as Source;
}

function defaults(deps: Partial<ManageDeps>): ManageDeps {
  return {
    read: deps.read ?? (() => readRegistry()),
    save: deps.save ?? (r => writeRegistry(r)),
    findInstalled: deps.findInstalled ?? (n => findInstalled(n)),
    fetch: deps.fetch ?? realFetch,
    chooseSource: deps.chooseSource ?? askSource,
    interactive: deps.interactive ?? isInteractive,
  };
}

function say(line: string): void {
  process.stderr.write(line.endsWith('\n') ? line : `${line}\n`);
}

/**
 * Adds frameworks to exciton, asking only where there is a real choice.
 *
 * With nothing installed through Claude there is exactly one possible answer,
 * so no question is asked. With a copy already installed, the one question that
 * matters gets asked once, and the answer is remembered.
 */
export function addCommand(
  names: string[], deps: Partial<ManageDeps> = {}, opts: AddOptions = {},
): number {
  const d = defaults(deps);
  const specs = names.length > 0 ? names : [...FRAMEWORKS];

  const strays = specs.filter(n => !isFramework(n));
  if (strays.length > 0) throw unmanagedError(strays);

  let reg = d.read();
  let changed = false;

  for (const name of specs) {
    const already = isAdded(reg, name);
    // Bare `add` on something already added is a no-op: "add" means make sure
    // it is there, not download it again. An explicit source is a deliberate
    // instruction to switch, so it always applies.
    if (already && !opts.source) {
      say(note(`${name} is already added`, [
        `It runs ${describeSource(reg.frameworks[name].source)}.`,
        dim(`Use --own or --use-installed to switch, or \`exciton remove ${name}\` to drop it.`),
      ]));
      continue;
    }

    const hit = d.findInstalled(name);
    let source: Source;
    if (opts.source) {
      source = opts.source;
    } else if (!hit) {
      source = 'own'; // nothing installed — no choice to offer
    } else if (!d.interactive()) {
      throw new UserError(`${name} can be added two ways, and there's no terminal to ask`, [
        `You already have ${name} ${hit.version} installed through Claude, so exciton ` +
        'needs to know which copy to run.',
        `${bold('--use-installed')}   track Claude's copy — nothing to download\n` +
        `${bold('--own')}             keep an independent exciton copy`,
      ]);
    } else {
      source = d.chooseSource(name, hit.version);
    }

    if (source === 'own') d.fetch(name);
    reg = addFramework(reg, name, source);
    changed = true;
    say(addedMessage(name, source));
  }

  // Someone who reached `add` directly has onboarded themselves; recording that
  // stops the walkthrough ambushing them on a later command.
  if (changed) d.save(isOnboarded(reg) ? reg : markOnboarded(reg));
  return 0;
}

export function describeSource(source: Source): string {
  return source === 'installed'
    ? 'from the copy Claude already has installed, which Claude keeps current'
    : "from exciton's own copy, independent of Claude and refreshed by `exciton update`";
}

/** Shared so onboarding and `add` confirm an addition identically. */
export function addedMessage(name: string, source: Source): string {
  return success(`Added ${bold(name)}`, [
    `It runs ${describeSource(source)}.`,
    dim(`Try  exciton ${name} --no-hooks  — skills stay callable, nothing auto-fires.`),
  ]);
}

export function removeCommand(names: string[], deps: Partial<ManageDeps> = {}): number {
  const d = defaults(deps);
  if (names.length === 0) {
    const added = addedNames(d.read());
    say(failure('Name a framework to remove', [
      added.length > 0 ? `You have ${added.join(', ')} added.` : 'Nothing is added.',
    ]));
    return 1;
  }

  let reg = d.read();
  const missing = names.filter(n => !isAdded(reg, n));
  if (missing.length > 0) {
    say(failure(`${missing.join(', ')} ${missing.length > 1 ? "aren't" : "isn't"} added`, [
      'There is nothing to remove.',
    ]));
    return 1;
  }

  for (const name of names) {
    reg = removeFramework(reg, name);
    say(success(`Removed ${bold(name)}`, [
      dim(`\`exciton ${name}\` will refuse until you add it again.`),
    ]));
  }
  d.save(reg);
  return 0;
}

/**
 * Refreshes exciton's own copies to the newest release.
 *
 * A framework tracking Claude's copy has nothing for exciton to update — saying
 * so is the point, because it teaches where that copy actually comes from.
 */
export function updateCommand(names: string[], deps: Partial<ManageDeps> = {}): number {
  const d = defaults(deps);
  const reg = d.read();
  const added = addedNames(reg);

  if (added.length === 0) {
    say(failure('Nothing is added yet', [
      `There is nothing to update.  Start with  ${bold('exciton add')}`,
    ]));
    return 1;
  }

  const targets = names.length > 0 ? names : added;
  const missing = targets.filter(n => !isAdded(reg, n));
  if (missing.length > 0) {
    say(failure(`${missing.join(', ')} isn't added`, [
      `Run  ${bold(`exciton add ${missing[0]}`)}  first.`,
    ]));
    return 1;
  }

  for (const name of targets) {
    if (reg.frameworks[name].source === 'installed') {
      say(note(`${name} tracks Claude's copy`, [
        'Claude keeps that copy current, so there is nothing for exciton to update.',
        dim(`Switch with  exciton add ${name} --own  if you want exciton to manage it.`),
      ]));
      continue;
    }
    d.fetch(name);
    say(success(`${bold(name)} is at the newest release`));
  }
  return 0;
}
