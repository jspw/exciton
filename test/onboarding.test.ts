import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboard } from '../src/onboarding.ts';
import { emptyRegistry, isOnboarded, addedNames, type Registry } from '../src/registry.ts';
import type { InstalledPlugin } from '../src/installed.ts';

function installed(name: string, version = '6.3.0'): InstalledPlugin {
  return { id: `${name}@market`, name, installPath: `/claude/${name}`, version, sha: 'abc' };
}

function harness(present: InstalledPlugin[] = []) {
  const saved: Registry[] = [];
  const fetched: string[] = [];
  const output: string[] = [];
  return {
    saved, fetched, output,
    last: () => saved[saved.length - 1],
    text: () => output.join('\n'),
    deps: {
      read: () => emptyRegistry(),
      save: (r: Registry) => { saved.push(r); },
      findInstalled: (n: string) => present.find(p => p.name === n),
      fetch: (n: string) => { fetched.push(n); return '/staged'; },
      pick: () => ['superpowers'],
      chooseSource: () => 'installed' as const,
      now: () => new Date('2026-08-20T12:00:00.000Z'),
      say: (l: string) => { output.push(l); },
    },
  };
}

test('the walkthrough explains what exciton is before asking anything', () => {
  const h = harness();
  onboard({ ...h.deps, pick: () => [] });
  assert.match(h.text(), /exciton/);
  assert.match(h.text(), /every.*session/is, 'names the problem it solves');
});

/** The sentence that makes a setup step acceptable rather than alarming. */
test('the walkthrough promises this is not a global install', () => {
  const h = harness();
  onboard({ ...h.deps, pick: () => [] });
  assert.match(h.text(), /not a global install/i);
  assert.match(h.text(), /~\/\.claude/);
});

test('a framework already installed through Claude is flagged in the picker', () => {
  const h = harness([installed('superpowers', '6.3.0')]);
  let offered: { hint?: string }[] = [];
  onboard({ ...h.deps, pick: c => { offered = c; return []; } });
  assert.match(offered[0].hint ?? '', /already installed/i);
  assert.match(offered[0].hint ?? '', /6\.3\.0/);
});

test('a framework not installed is flagged as such', () => {
  const h = harness();
  let offered: { hint?: string }[] = [];
  onboard({ ...h.deps, pick: c => { offered = c; return []; } });
  assert.match(offered[0].hint ?? '', /not installed/i);
});

/**
 * The case the onboardedAt timestamp exists for: adding nothing is a real
 * answer, and it has to stick, or the walkthrough reappears on every run.
 */
test('choosing nothing still records that onboarding happened', () => {
  const h = harness();
  onboard({ ...h.deps, pick: () => [] });
  assert.equal(isOnboarded(h.last()), true);
  assert.deepEqual(addedNames(h.last()), []);
  assert.deepEqual(h.fetched, []);
});

test('choosing nothing says how to come back to it', () => {
  const h = harness();
  onboard({ ...h.deps, pick: () => [] });
  assert.match(h.text(), /exciton add/);
});

test('picking a framework already installed asks which copy to use', () => {
  const h = harness([installed('superpowers')]);
  const asked: string[] = [];
  onboard({ ...h.deps, chooseSource: n => { asked.push(n); return 'installed'; } });
  assert.deepEqual(asked, ['superpowers']);
  assert.equal(h.last().frameworks.superpowers.source, 'installed');
  assert.deepEqual(h.fetched, [], 'tracking Claude’s copy downloads nothing');
});

test('picking a framework that is not installed asks nothing and fetches it', () => {
  const h = harness();
  let asked = 0;
  onboard({ ...h.deps, chooseSource: () => { asked++; return 'own'; } });
  assert.equal(asked, 0, 'a question with one possible answer must not be asked');
  assert.deepEqual(h.fetched, ['superpowers']);
  assert.equal(h.last().frameworks.superpowers.source, 'own');
});

test('onboarding records when it happened', () => {
  const h = harness();
  onboard({ ...h.deps, pick: () => [] });
  assert.equal(h.last().onboardedAt, '2026-08-20T12:00:00.000Z');
});

test('finishing points at a command that will actually work', () => {
  const h = harness([installed('superpowers')]);
  onboard(h.deps);
  assert.match(h.text(), /exciton superpowers --no-hooks/);
});

/**
 * `add` and onboarding confirm an addition with the same text, from one
 * function — they had already drifted apart once when each wrote its own.
 */
test('onboarding confirms which copy was chosen, exactly as add does', () => {
  const h = harness([installed('superpowers')]);
  onboard({ ...h.deps, chooseSource: () => 'installed' });
  assert.match(h.text(), /Added superpowers/);
  assert.match(h.text(), /copy Claude already has installed/);
});

test('choosing an exciton copy is confirmed as such', () => {
  const h = harness();
  onboard(h.deps);
  assert.match(h.text(), /exciton's own copy/);
});
