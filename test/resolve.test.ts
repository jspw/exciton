import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePlugin } from '../src/resolve.ts';

const installed = {
  id: 'superpowers@claude-plugins-official', name: 'superpowers',
  installPath: '/cache/superpowers/6.3.0', version: '6.3.0', sha: 'b36e0829aaa',
};

test('tier 1: an installed plugin resolves with no network access', () => {
  let fetched = false;
  const r = resolvePlugin('superpowers', {
    findInstalled: () => installed,
    cloneSource: () => { fetched = true; return { dir: '/never', version: '0.0.0' }; },
  });
  assert.equal(r.origin, 'installed');
  assert.equal(r.dir, '/cache/superpowers/6.3.0');
  assert.equal(fetched, false);
});

test('tier 2: an uninstalled plugin is fetched from its marketplace source', () => {
  const r = resolvePlugin('superpowers', {
    findInstalled: () => undefined,
    findInMarketplaces: () => ({ kind: 'git', url: 'https://x/sp.git' }),
    cloneSource: () => ({ dir: '/exciton/src/superpowers/6.3.0', version: '6.3.0' }),
  });
  assert.equal(r.origin, 'fetched');
  assert.equal(r.dir, '/exciton/src/superpowers/6.3.0');
  assert.equal(r.version, '6.3.0', 'the version comes from the tag actually cloned');
});

/**
 * Claude Code's own identifier for a plugin is `name@marketplace`, and it is
 * what appears in settings.json — so it is what people copy. exciton has no
 * competing meaning for `@`, so the marketplace half is simply ignored.
 */
test('a full plugin id resolves to the installed copy, not a git ref', () => {
  let fetched = false;
  const r = resolvePlugin('superpowers@claude-plugins-official', {
    findInstalled: () => installed,
    cloneSource: () => { fetched = true; return { dir: '/never', version: '0.0.0' }; },
  });
  assert.equal(r.origin, 'installed');
  assert.equal(r.name, 'superpowers');
  assert.equal(fetched, false, 'must not clone when the copy is already on disk');
});

test('a plugin id for an uninstalled plugin still resolves by its name', () => {
  const seen: string[] = [];
  const r = resolvePlugin('superpowers@claude-plugins-official', {
    findInstalled: () => undefined,
    findInMarketplaces: n => { seen.push(n); return { kind: 'git', url: 'https://x/sp.git' }; },
    cloneSource: () => ({ dir: '/exciton/src/superpowers/6.3.0', version: '6.3.0' }),
  });
  assert.deepEqual(seen, ['superpowers'], 'the marketplace half is not part of the name');
  assert.equal(r.name, 'superpowers');
});

test('tier 3: a filesystem path resolves to itself and reads its manifest name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xc-plug-'));
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'my-plugin', version: '1.2.3' }));
  const r = resolvePlugin(dir, {});
  assert.equal(r.origin, 'path');
  assert.equal(r.name, 'my-plugin');
  assert.equal(r.version, '1.2.3');
  assert.equal(r.dir, dir);
});

test('an unresolvable name errors with the name in the message', () => {
  assert.throws(
    () => resolvePlugin('ghost', { findInstalled: () => undefined, findInMarketplaces: () => undefined }),
    /ghost/,
  );
});

/**
 * `--own` has to mean something. Without skipping the installed lookup, a
 * framework Claude has installed always wins, and "keep an exciton copy"
 * silently hands back Claude's copy — the choice becomes decorative.
 */
test('an own copy skips the installed lookup and clones', () => {
  let cloned = false;
  const r = resolvePlugin('superpowers', {
    findInstalled: () => installed,
    findInMarketplaces: () => ({ kind: 'git', url: 'https://x/sp.git' }),
    cloneSource: () => { cloned = true; return { dir: '/exciton/src/superpowers/6.3.0', version: '6.3.0' }; },
  }, { ownCopy: true });
  assert.equal(r.origin, 'fetched');
  assert.equal(r.dir, '/exciton/src/superpowers/6.3.0');
  assert.equal(cloned, true);
});

test('without the own-copy option the installed lookup still wins', () => {
  const r = resolvePlugin('superpowers', {
    findInstalled: () => installed,
    cloneSource: () => ({ dir: '/never', version: '0.0.0' }),
  }, {});
  assert.equal(r.origin, 'installed');
});
