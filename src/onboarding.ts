import { FRAMEWORKS } from './frameworks.ts';
import { findInstalled, type InstalledPlugin } from './installed.ts';
import { resolvePlugin } from './resolve.ts';
import { stagePlugin } from './stage.ts';
import { multiselect, type Choice } from './prompt.ts';
import { askSource, addedMessage } from './commands/manage.ts';
import { bold, cyan, dim, note, DOT } from './ui.ts';
import {
  readRegistry, writeRegistry, addFramework, markOnboarded, isAdded,
  type Registry, type Source,
} from './registry.ts';

export interface OnboardDeps {
  read: () => Registry;
  save: (reg: Registry) => void;
  findInstalled: (name: string) => InstalledPlugin | undefined;
  /** Which frameworks to add — none, one, or several. */
  pick: (choices: Choice[]) => string[];
  chooseSource: (name: string, installedVersion: string) => Source;
  fetch: (name: string) => string;
  now: () => Date;
  say: (line: string) => void;
}

function defaults(deps: Partial<OnboardDeps>): OnboardDeps {
  return {
    read: deps.read ?? (() => readRegistry()),
    save: deps.save ?? (r => writeRegistry(r)),
    findInstalled: deps.findInstalled ?? (n => findInstalled(n)),
    pick: deps.pick ?? (choices => multiselect(
      'Which would you like to add?',
      choices,
    )),
    chooseSource: deps.chooseSource ?? askSource,
    fetch: deps.fetch ?? (n => stagePlugin(resolvePlugin(n, {}, { ownCopy: true }), 'nohooks')),
    now: deps.now ?? (() => new Date()),
    say: deps.say ?? (line => process.stderr.write(`${line}\n`)),
  };
}

/**
 * What exciton is, before it asks for anything.
 *
 * The one sentence that has to land is that adding is not installing. Someone
 * being asked to run a setup step deserves to know it costs them nothing
 * globally, or the whole flow reads as the thing they were trying to avoid.
 */
function welcome(say: (l: string) => void): void {
  say('');
  say(`  ${bold(cyan('exciton'))}`);
  say('');
  say(`  Agentic frameworks install once and then govern ${bold('every')} session —`);
  say('  a three-line bug fix gets the same ceremony as a new subsystem.');
  say('');
  say('  exciton runs one framework per session, at the level you choose,');
  say('  and leaves everything else exactly as it was.');
  say('');
  say(`  ${dim('Adding one here is not a global install: nothing under ~/.claude is')}`);
  say(`  ${dim('ever written. Quit exciton, run claude, and it behaves as it always did.')}`);
  say('');
}

/** Runs the first-contact walkthrough and records the outcome. */
export function onboard(deps: Partial<OnboardDeps> = {}): number {
  const d = defaults(deps);
  d.say = d.say ?? (line => process.stderr.write(`${line}\n`));

  welcome(d.say);

  const choices: Choice[] = [...FRAMEWORKS].map(name => {
    const hit = d.findInstalled(name);
    return {
      value: name,
      label: name,
      hint: hit ? `already installed through Claude ${DOT} ${hit.version}` : 'not installed yet',
    };
  });

  const picked = d.pick(choices);

  let reg = d.read();
  for (const name of picked) {
    if (isAdded(reg, name)) continue;
    const hit = d.findInstalled(name);
    // Nothing installed means there is nothing to choose between.
    const source: Source = hit ? d.chooseSource(name, hit.version) : 'own';
    if (source === 'own') d.fetch(name);
    reg = addFramework(reg, name, source);
  }

  d.save(markOnboarded(reg, d.now()));
  d.say('');

  if (picked.length === 0) {
    // Choosing nothing is a real answer, and it is recorded — this walkthrough
    // must never appear again just because the outcome was empty.
    d.say(note('Nothing added', [
      dim('Run  exciton add  whenever you want to.'),
    ]));
  } else {
    // The same confirmation `exciton add` gives, so the two cannot drift.
    for (const name of picked) d.say(addedMessage(name, reg.frameworks[name].source));
  }
  return 0;
}
