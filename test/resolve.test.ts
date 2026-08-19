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
    cloneSource: () => { fetched = true; return '/never'; },
  });
  assert.equal(r.origin, 'installed');
  assert.equal(r.dir, '/cache/superpowers/6.3.0');
  assert.equal(fetched, false);
});

test('tier 2: an uninstalled plugin is fetched from its marketplace source', () => {
  const r = resolvePlugin('superpowers', {
    findInstalled: () => undefined,
    findInMarketplaces: () => ({ kind: 'git', url: 'https://x/sp.git', sha: 'abc1234def' }),
    cloneSource: () => '/exciton/src/superpowers/abc1234',
  });
  assert.equal(r.origin, 'fetched');
  assert.equal(r.dir, '/exciton/src/superpowers/abc1234');
  assert.equal(r.sha, 'abc1234def');
});

test('an explicit ref forces tier 2 even when installed', () => {
  const r = resolvePlugin('superpowers@6.2.0', {
    findInstalled: () => installed,
    findInMarketplaces: () => ({ kind: 'git', url: 'https://x/sp.git', sha: '' }),
    cloneSource: () => '/exciton/src/superpowers/6.2.0',
  });
  assert.equal(r.origin, 'fetched');
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
