import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectPluginIds, buildDisablePayload } from '../src/settings.ts';

function repoWith(project: object | null, local: object | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'xc-'));
  mkdirSync(join(dir, '.claude'), { recursive: true });
  if (project) writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify(project));
  if (local) writeFileSync(join(dir, '.claude', 'settings.local.json'), JSON.stringify(local));
  return dir;
}

test('unions ids from project and local scopes', () => {
  const dir = repoWith(
    { enabledPlugins: { 'a@m': true } },
    { enabledPlugins: { 'b@m': true } },
  );
  const { ids } = collectPluginIds(dir);
  assert.ok(ids.includes('a@m'));
  assert.ok(ids.includes('b@m'));
});

test('includes ids already set to false, so the payload is exhaustive', () => {
  const dir = repoWith({ enabledPlugins: { 'a@m': false } }, null);
  assert.ok(collectPluginIds(dir).ids.includes('a@m'));
});

test('ids are unique and sorted for a stable payload', () => {
  const dir = repoWith(
    { enabledPlugins: { 'b@m': true, 'a@m': true } },
    { enabledPlugins: { 'a@m': true } },
  );
  const { ids } = collectPluginIds(dir);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), ids);
});

test('missing or malformed settings files are skipped, not fatal', () => {
  const dir = repoWith(null, null);
  writeFileSync(join(dir, '.claude', 'settings.json'), '{ not json');
  assert.doesNotThrow(() => collectPluginIds(dir));
});

test('payload contains only enabledPlugins, every value false', () => {
  const payload = JSON.parse(buildDisablePayload(['a@m', 'b@m']));
  assert.deepEqual(Object.keys(payload), ['enabledPlugins']);
  assert.deepEqual(payload.enabledPlugins, { 'a@m': false, 'b@m': false });
});

test('an empty selection yields a payload that changes nothing', () => {
  assert.deepEqual(JSON.parse(buildDisablePayload([])), { enabledPlugins: {} });
});
