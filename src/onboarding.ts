import { FRAMEWORKS } from './frameworks.ts';
import { findInstalled, type InstalledPlugin } from './installed.ts';
import { resolvePlugin } from './resolve.ts';
import { stagePlugin } from './stage.ts';
import { multiselect, type Choice } from './prompt.ts';
import { askSource } from './commands/manage.ts';
import { bold, cyan, dim, rail, step, RAIL_OPEN, RAIL_CLOSE, STEP_DONE, DOT } from './ui.ts';
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
  // Resolved first: the fetch progress reporter below writes through it.
  const say = deps.say ?? ((line: string) => process.stderr.write(`${line}\n`));
  return {
    say,
    read: deps.read ?? (() => readRegistry()),
    save: deps.save ?? (r => writeRegistry(r)),
    findInstalled: deps.findInstalled ?? (n => findInstalled(n)),
    pick: deps.pick ?? (choices => multiselect(
      'Which would you like to add?',
      choices,
    )),
    chooseSource: deps.chooseSource ?? askSource,
    fetch: deps.fetch ?? (n => stagePlugin(
      resolvePlugin(n, {}, {
        ownCopy: true,
        // On the rail, so a download does not break the flow it happens inside.
        say: text => { say(step(STEP_DONE, text)); say(rail()); },
      }),
      'nohooks',
    )),
    now: deps.now ?? (() => new Date()),
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
  say(`${cyan(RAIL_OPEN)}  ${bold(cyan('exciton'))}`);
  say(rail());
  say(rail(`Agentic frameworks install once and then govern ${bold('every')} session —`));
  say(rail('a three-line bug fix gets the same ceremony as a new subsystem.'));
  say(rail());
  say(rail('exciton runs one framework per session, at the level you choose,'));
  say(rail('and leaves everything else exactly as it was.'));
  say(rail());
  say(rail(dim('Adding one here is not a global install: nothing under ~/.claude')));
  say(rail(dim('is ever written. Quit exciton, run claude, and nothing has changed.')));
  say(rail());
}

/** Runs the first-contact walkthrough and records the outcome. */
export function onboard(deps: Partial<OnboardDeps> = {}): number {
  const d = defaults(deps);
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

  // The closing attaches straight to the rail — a blank line above it would
  // break the gutter at the exact point it is meant to terminate.
  // It deliberately does not restate which copy was chosen: the deliberately does not restate which copy was chosen: the
  // answered step above still shows it, and repeating it was the thing that
  // made this read as generated rather than considered.
  if (picked.length === 0) {
    d.say(`${cyan(RAIL_CLOSE)}  Nothing added`);
    d.say('');
    d.say(`   ${dim('Run')}  ${bold('exciton add')}  ${dim('whenever you want to.')}`);
  } else {
    d.say(`${cyan(RAIL_CLOSE)}  Added ${bold(picked.join(', '))}`);
    d.say('');
    d.say(`   ${dim('Try')}  ${bold(`exciton ${picked[0]} --no-hooks`)}`);
    d.say(`   ${dim('Skills stay callable, nothing auto-fires.')}`);
  }
  d.say('');
  return 0;
}
