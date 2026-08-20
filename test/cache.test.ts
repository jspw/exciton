import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanCache, liveSessions } from '../src/commands/cache.ts';


function populatedCache(): string {
  const root = mkdtempSync(join(tmpdir(), 'xc-cache-'));
  mkdirSync(join(root, 'staged', 'sp-6.3.0-abc-nohooks'), { recursive: true });
  mkdirSync(join(root, 'src', 'sp', 'abc1234'), { recursive: true });
  writeFileSync(join(root, 'staged', 'sp-6.3.0-abc-nohooks', 'f'), 'x');
  return root;
}

/** `ps -A -ww -o pid=,args=` output: leading-padded pid, then the command line. */
function ps(...lines: string[]): () => string {
  return () => lines.map(l => `  ${l}`).join('\n');
}

test('removes both cache directories', () => {
  const root = populatedCache();
  assert.equal(cleanCache({ root, live: () => 0 }), 0);
  assert.equal(existsSync(join(root, 'staged')), false);
  assert.equal(existsSync(join(root, 'src')), false);
});

test('leaves the exciton root itself in place', () => {
  const root = populatedCache();
  cleanCache({ root, live: () => 0 });
  assert.ok(existsSync(root));
});

test('cleaning an empty cache succeeds', () => {
  const root = mkdtempSync(join(tmpdir(), 'xc-empty-'));
  assert.equal(cleanCache({ root, live: () => 0 }), 0);
});

/**
 * A live session is reading its skills from the tree --plugin-dir points at.
 * Deleting it mid-session makes skills fail against a path that no longer
 * exists, so refuse rather than hand back a half-working framework.
 */
test('cleaning is refused while a session is running from the cache', () => {
  const root = populatedCache();
  assert.equal(cleanCache({ root, live: () => 1 }), 1);
  assert.ok(existsSync(join(root, 'staged')), 'nothing may be deleted when refusing');
  assert.ok(existsSync(join(root, 'src')));
});

test('--force cleans anyway, for a stuck or miscounted session', () => {
  const root = populatedCache();
  assert.equal(cleanCache({ root, force: true, live: () => 2 }), 0);
  assert.equal(existsSync(join(root, 'staged')), false);
});

test('a session launched from the cache is counted', () => {
  const root = '/home/u/.exciton';
  const n = liveSessions(root, ps(`901 claude --plugin-dir ${root}/staged/sp-6.3.0-abc-nohooks`));
  assert.equal(n, 1);
});

/** The `full` profile points --plugin-dir at the clone under src/, not staged/. */
test('a full-profile session running from src/ counts too', () => {
  const root = '/home/u/.exciton';
  assert.equal(liveSessions(root, ps(`902 claude --plugin-dir ${root}/src/sp/abc1234`)), 1);
});

test('an ordinary claude session is not mistaken for one of ours', () => {
  assert.equal(liveSessions('/home/u/.exciton', ps('903 claude --plugin-dir /opt/other/plugin')), 0);
});

/**
 * A shell command that merely mentions the path — a grep, an editor, this
 * project's own tests — is not a session holding the cache open.
 */
test('merely naming the cache path is not a live session', () => {
  const root = '/home/u/.exciton';
  assert.equal(liveSessions(root, ps(`904 grep -r staged ${root}`)), 0);
});

test('our own process cannot count itself as a live session', () => {
  const root = '/home/u/.exciton';
  const self = `${process.pid} node cli.ts clean --plugin-dir ${root}/staged/k`;
  assert.equal(liveSessions(root, ps(self)), 0);
});

test('several concurrent sessions are all counted', () => {
  const root = '/home/u/.exciton';
  const n = liveSessions(root, ps(
    `905 claude --plugin-dir ${root}/staged/a`,
    `906 claude --plugin-dir ${root}/staged/b`,
    '907 /sbin/launchd',
  ));
  assert.equal(n, 2);
});

/** No `ps` at all must not make `clean` permanently unusable. */
test('an unreadable process table reports no sessions rather than blocking', () => {
  assert.equal(liveSessions('/home/u/.exciton', () => ''), 0);
});
