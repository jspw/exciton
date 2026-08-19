import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneSource } from '../src/fetch.ts';

/** Records invocations, and creates the clone target so renameSync can succeed. */
function fakeRun(calls: string[][]) {
  return (cmd: string, args: string[], _cwd?: string) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'clone') mkdirSync(args[args.length - 1], { recursive: true });
  };
}

/** Keeps every test inside a temp dir — never touches the real ~/.exciton. */
function tempCache(): (name: string, sha: string) => string {
  const root = mkdtempSync(join(tmpdir(), 'xc-cache-'));
  return (name, sha) => join(root, 'src', name, sha);
}

test('clones shallow and checks out the pinned sha', () => {
  const calls: string[][] = [];
  const dir = cloneSource(
    'superpowers',
    { kind: 'git', url: 'https://example.com/sp.git', sha: 'abc1234def' },
    fakeRun(calls),
    tempCache(),
  );
  assert.match(dir, /\/src\/superpowers\/abc1234$/);
  assert.equal(calls[0][0], 'git');
  assert.ok(calls[0].includes('clone'));
  assert.ok(calls[0].includes('--depth'));
  assert.ok(calls.some(c => c.includes('checkout') && c.includes('abc1234def')));
});

test('without a pinned sha it clones the default branch under "head"', () => {
  const calls: string[][] = [];
  const dir = cloneSource(
    'x', { kind: 'git', url: 'https://example.com/x.git', sha: '' },
    fakeRun(calls), tempCache(),
  );
  assert.match(dir, /\/src\/x\/head$/);
  assert.ok(!calls.some(c => c.includes('checkout')));
});

test('an unsupported source fails loudly with the stated reason', () => {
  assert.throws(
    () => cloneSource('x', { kind: 'unsupported', reason: 'declared command' }, () => {}, tempCache()),
    /declared command/,
  );
});

test('a failed clone leaves no partial directory behind', () => {
  const resolveDir = tempCache();
  assert.throws(() => cloneSource(
    'x', { kind: 'git', url: 'u', sha: 'abc1234' },
    () => { throw new Error('network down'); },
    resolveDir,
  ), /network down/);
  assert.equal(existsSync(resolveDir('x', 'abc1234')), false);
});

test('an existing cache directory short-circuits the clone', () => {
  const resolveDir = tempCache();
  mkdirSync(resolveDir('x', 'abc1234'), { recursive: true });
  const calls: string[][] = [];
  const dir = cloneSource('x', { kind: 'git', url: 'u', sha: 'abc1234' }, fakeRun(calls), resolveDir);
  assert.equal(dir, resolveDir('x', 'abc1234'));
  assert.equal(calls.length, 0);
});
