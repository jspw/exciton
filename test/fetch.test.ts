import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneSource, latestTag } from '../src/fetch.ts';

/** Records invocations, and creates the clone target so renameSync can succeed. */
function fakeRun(calls: string[][]) {
  return (cmd: string, args: string[], _cwd?: string) => {
    calls.push([cmd, ...args]);
    if (args.includes('clone')) mkdirSync(args[args.length - 1], { recursive: true });
  };
}

/** Shapes `git ls-remote --tags --refs` output from a list of tag names. */
function fakeTags(...tags: string[]) {
  return () => tags.map((t, i) => `${'a'.repeat(40 - String(i).length)}${i}\trefs/tags/${t}`).join('\n');
}

/** Keeps every test inside a temp dir — never touches the real ~/.exciton. */
function tempCache(): (name: string, key: string) => string {
  const root = mkdtempSync(join(tmpdir(), 'xc-cache-'));
  return (name, key) => join(root, 'src', name, key);
}

test('the newest release is chosen by version order, not alphabetically', () => {
  assert.equal(latestTag('u', fakeTags('v6.2.0', 'v6.10.0', 'v6.3.0')), 'v6.10.0');
});

test('tags are read whether or not they carry a v prefix', () => {
  assert.equal(latestTag('u', fakeTags('1.0.0', '2.0.0')), '2.0.0');
  assert.equal(latestTag('u', fakeTags('v1.0.0', 'v2.0.0')), 'v2.0.0');
});

/** Pre-releases are not releases; "latest" must not hand someone a beta. */
test('pre-release and non-version tags are ignored', () => {
  assert.equal(latestTag('u', fakeTags('v1.0.0', 'v2.0.0-beta.1', 'nightly')), 'v1.0.0');
});

test('a repository with no usable tags reports none', () => {
  assert.equal(latestTag('u', fakeTags('nightly', 'latest')), '');
  assert.equal(latestTag('u', () => ''), '');
});

test('clones the newest release in one shallow operation', () => {
  const calls: string[][] = [];
  const got = cloneSource('superpowers', { kind: 'git', url: 'https://x/sp.git' }, {
    run: fakeRun(calls), capture: fakeTags('v6.2.0', 'v6.3.0'), resolveDir: tempCache(), say: () => {},
  });
  assert.equal(got.version, '6.3.0');
  assert.match(got.dir, /\/src\/superpowers\/6\.3\.0$/);

  const clone = calls.find(c => c.includes('clone'))!;
  assert.ok(clone.includes('--depth'), 'stays shallow');
  assert.ok(clone.includes('--branch') && clone.includes('v6.3.0'), 'clones the tag directly');
  assert.equal(calls.filter(c => c.includes('checkout') || c.includes('fetch')).length, 0,
    'no separate fetch/checkout step remains');
});

test('with no releases it falls back to the default branch', () => {
  const calls: string[][] = [];
  const got = cloneSource('x', { kind: 'git', url: 'https://x/x.git' }, {
    run: fakeRun(calls), capture: () => '', resolveDir: tempCache(), say: () => {},
  });
  assert.match(got.dir, /\/src\/x\/head$/);
  assert.ok(!calls.some(c => c.includes('--branch')));
});

test('an unsupported source fails loudly with the stated reason', () => {
  assert.throws(
    () => cloneSource('x', { kind: 'unsupported', reason: 'declared command' }, {
      run: () => {}, capture: () => '', resolveDir: tempCache(), say: () => {},
    }),
    /declared command/,
  );
});

test('a failed clone leaves no partial directory behind', () => {
  const resolveDir = tempCache();
  assert.throws(() => cloneSource('x', { kind: 'git', url: 'u' }, {
    run: () => { throw new Error('network down'); },
    capture: fakeTags('v1.0.0'), resolveDir, say: () => {},
  }), /network down/);
  assert.equal(existsSync(resolveDir('x', '1.0.0')), false);
});

test('an existing cache directory short-circuits the clone', () => {
  const resolveDir = tempCache();
  mkdirSync(resolveDir('x', '1.0.0'), { recursive: true });
  const calls: string[][] = [];
  const got = cloneSource('x', { kind: 'git', url: 'u' }, {
    run: fakeRun(calls), capture: fakeTags('v1.0.0'), resolveDir, say: () => {},
  });
  assert.equal(got.dir, resolveDir('x', '1.0.0'));
  assert.equal(got.version, '1.0.0');
  assert.equal(calls.length, 0);
});

/** git narrating clone progress and detached-HEAD advice into a walkthrough. */
test('git is told not to write to the terminal', () => {
  const calls: string[][] = [];
  cloneSource('x', { kind: 'git', url: 'u' }, {
    run: fakeRun(calls), capture: fakeTags('v1.0.0'), resolveDir: tempCache(), say: () => {},
  });
  const clone = calls.find(c => c.includes('clone'))!;
  assert.ok(clone.includes('--quiet'));
  assert.ok(clone.includes('advice.detachedHead=false'));
});

test('a slow clone announces itself rather than hanging silently', () => {
  const said: string[] = [];
  cloneSource('superpowers', { kind: 'git', url: 'u' }, {
    run: fakeRun([]), capture: fakeTags('v6.3.0'), resolveDir: tempCache(),
    say: l => { said.push(l); },
  });
  assert.match(said.join(''), /Fetching superpowers v6\.3\.0/);
});

test('a cached copy says nothing at all', () => {
  const resolveDir = tempCache();
  mkdirSync(resolveDir('x', '1.0.0'), { recursive: true });
  const said: string[] = [];
  cloneSource('x', { kind: 'git', url: 'u' }, {
    run: fakeRun([]), capture: fakeTags('v1.0.0'), resolveDir, say: l => { said.push(l); },
  });
  assert.deepEqual(said, []);
});
