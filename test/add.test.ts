import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCommand, removeCommand, updateCommand } from '../src/commands/manage.ts';
import { emptyRegistry, addFramework, addedNames, isOnboarded, markOnboarded,
  type Registry } from '../src/registry.ts';
import type { InstalledPlugin } from '../src/installed.ts';
import { UserError } from '../src/ui.ts';
/** What the user actually sees: a UserError's headline plus its detail lines. */
function shown(fn: () => unknown): string {
  try { fn(); } catch (e) {
    return e instanceof UserError ? e.render() : String((e as Error).message);
  }
  throw new Error('expected a throw, got none');
}


function installed(name: string, version = '6.3.0'): InstalledPlugin {
  return { id: `${name}@market`, name, installPath: `/claude/${name}`, version, sha: 'abc' };
}

/** Captures what a command would persist, so no test touches a real config. */
function harness(reg: Registry = emptyRegistry(), present: InstalledPlugin[] = []) {
  const saved: Registry[] = [];
  const fetched: string[] = [];
  return {
    saved, fetched,
    deps: {
      read: () => reg,
      save: (r: Registry) => { saved.push(r); },
      findInstalled: (n: string) => present.find(p => p.name === n),
      fetch: (n: string) => { fetched.push(n); return '/exciton/src/' + n + '/6.3.0'; },
      chooseSource: () => 'installed' as const,
      interactive: () => true,
    },
    last: () => saved[saved.length - 1],
  };
}

// ---- add ----------------------------------------------------------------

/** Nothing installed means nothing to decide: adding exciton's copy is the only option. */
test('adding a framework Claude does not have asks nothing and fetches it', () => {
  const h = harness();
  let asked = 0;
  assert.equal(addCommand(['superpowers'], { ...h.deps, chooseSource: () => { asked++; return 'own'; } }), 0);
  assert.equal(asked, 0, 'a question with one possible answer must not be asked');
  assert.deepEqual(h.fetched, ['superpowers']);
  assert.equal(h.last().frameworks.superpowers.source, 'own');
});

test('adding a framework Claude already has asks which copy to use', () => {
  const h = harness(emptyRegistry(), [installed('superpowers')]);
  const asked: string[] = [];
  addCommand(['superpowers'], { ...h.deps, chooseSource: n => { asked.push(n); return 'installed'; } });
  assert.deepEqual(asked, ['superpowers']);
  assert.equal(h.last().frameworks.superpowers.source, 'installed');
  assert.deepEqual(h.fetched, [], 'choosing Claude’s copy downloads nothing');
});

test('choosing an own copy at the prompt fetches it', () => {
  const h = harness(emptyRegistry(), [installed('superpowers')]);
  addCommand(['superpowers'], { ...h.deps, chooseSource: () => 'own' });
  assert.deepEqual(h.fetched, ['superpowers']);
  assert.equal(h.last().frameworks.superpowers.source, 'own');
});

/** `add` means "make sure it is added" — doing it twice is not a second download. */
test('adding something already added does nothing and succeeds', () => {
  const h = harness(addFramework(emptyRegistry(), 'superpowers', 'installed'), [installed('superpowers')]);
  let asked = 0;
  assert.equal(addCommand(['superpowers'], { ...h.deps, chooseSource: () => { asked++; return 'own'; } }), 0);
  assert.equal(asked, 0);
  assert.deepEqual(h.fetched, []);
  assert.deepEqual(h.saved, [], 'an unchanged registry is not rewritten');
});

test('an explicit source switches a framework already added', () => {
  const h = harness(addFramework(emptyRegistry(), 'superpowers', 'installed'), [installed('superpowers')]);
  assert.equal(addCommand(['superpowers'], h.deps, { source: 'own' }), 0);
  assert.equal(h.last().frameworks.superpowers.source, 'own');
  assert.deepEqual(h.fetched, ['superpowers']);
});

test('an explicit source needs no prompt even on a fresh add', () => {
  const h = harness(emptyRegistry(), [installed('superpowers')]);
  let asked = 0;
  addCommand(['superpowers'], { ...h.deps, chooseSource: () => { asked++; return 'own'; } },
    { source: 'installed' });
  assert.equal(asked, 0);
  assert.equal(h.last().frameworks.superpowers.source, 'installed');
});

test('adding an unmanaged plugin is refused', () => {
  const h = harness();
  assert.throws(() => addCommand(['warp'], h.deps), /warp/);
  assert.deepEqual(h.saved, []);
});

/** Non-interactive means CI: fail with instructions rather than wait forever. */
test('an ambiguous add without a terminal refuses instead of prompting', () => {
  const h = harness(emptyRegistry(), [installed('superpowers')]);
  const text = shown(() => addCommand(['superpowers'], { ...h.deps, interactive: () => false }));
  assert.match(text, /--use-installed/);
  assert.match(text, /--own/);
});

test('an unambiguous add works without a terminal', () => {
  const h = harness();
  assert.equal(addCommand(['superpowers'], { ...h.deps, interactive: () => false }), 0);
  assert.equal(h.last().frameworks.superpowers.source, 'own');
});

// ---- remove -------------------------------------------------------------

test('removing takes a framework out of the registry', () => {
  const h = harness(addFramework(emptyRegistry(), 'superpowers', 'own'));
  assert.equal(removeCommand(['superpowers'], h.deps), 0);
  assert.deepEqual(addedNames(h.last()), []);
});

test('removing something that was never added is refused, not silently ignored', () => {
  const h = harness();
  assert.equal(removeCommand(['superpowers'], h.deps), 1);
  assert.deepEqual(h.saved, []);
});

test('remove needs a name', () => {
  assert.equal(removeCommand([], harness().deps), 1);
});

// ---- update -------------------------------------------------------------

test('updating refetches every framework exciton keeps its own copy of', () => {
  let reg = addFramework(emptyRegistry(), 'superpowers', 'own');
  const h = harness(reg);
  assert.equal(updateCommand([], h.deps), 0);
  assert.deepEqual(h.fetched, ['superpowers']);
});

/** Claude owns that copy — saying so teaches the model better than silence does. */
test('updating a framework that tracks Claude’s copy fetches nothing', () => {
  const h = harness(addFramework(emptyRegistry(), 'superpowers', 'installed'));
  assert.equal(updateCommand(['superpowers'], h.deps), 0);
  assert.deepEqual(h.fetched, []);
});

test('updating something not added is refused', () => {
  assert.equal(updateCommand(['superpowers'], harness().deps), 1);
});

test('updating with nothing added at all is refused', () => {
  assert.equal(updateCommand([], harness().deps), 1);
});

/**
 * Reaching `add` directly is a way of onboarding yourself. Without recording
 * that, the first-run walkthrough would ambush someone who has already set up.
 */
test('adding marks onboarding complete, so the walkthrough will not reappear', () => {
  const h = harness();
  addCommand(['superpowers'], h.deps);
  assert.equal(isOnboarded(h.last()), true);
});

test('an existing onboarding timestamp is not overwritten by a later add', () => {
  const at = markOnboarded(emptyRegistry(), new Date('2026-01-01T00:00:00.000Z'));
  const h = harness(at);
  addCommand(['superpowers'], h.deps);
  assert.equal(h.last().onboardedAt, '2026-01-01T00:00:00.000Z');
});
