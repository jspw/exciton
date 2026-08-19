import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stagePlugin, stageKey } from '../src/stage.ts';
import type { Resolved } from '../src/resolve.ts';

function fakePlugin(): Resolved {
  const dir = mkdtempSync(join(tmpdir(), 'xc-sp-'));
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'superpowers', version: '6.3.0' }));
  mkdirSync(join(dir, 'skills', 'brainstorming'), { recursive: true });
  writeFileSync(join(dir, 'skills', 'brainstorming', 'SKILL.md'), '# skill');
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  writeFileSync(join(dir, 'hooks', 'hooks.json'), '{"hooks":{}}');
  mkdirSync(join(dir, '.in_use'), { recursive: true });
  writeFileSync(join(dir, '.in_use', '1234'), '');
  return { name: 'superpowers', dir, version: '6.3.0', sha: 'b36e0829aaa', origin: 'installed' };
}

test('full profile returns the source directory untouched — zero copy', () => {
  const r = fakePlugin();
  assert.equal(stagePlugin(r, 'full'), r.dir);
});

test('nohooks profile copies skills but omits hooks/ and .in_use/', () => {
  const r = fakePlugin();
  const out = mkdtempSync(join(tmpdir(), 'xc-out-'));
  const dir = stagePlugin(r, 'nohooks', () => join(out, 'staged'));
  assert.ok(existsSync(join(dir, 'skills', 'brainstorming', 'SKILL.md')));
  assert.ok(!existsSync(join(dir, 'hooks')));
  assert.ok(!existsSync(join(dir, '.in_use')));
});

test('nohooks staging preserves plugin.json name — precedence depends on it', () => {
  const r = fakePlugin();
  const out = mkdtempSync(join(tmpdir(), 'xc-out-'));
  const dir = stagePlugin(r, 'nohooks', () => join(out, 'staged'));
  const manifest = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'superpowers');
});

test('staging is idempotent — a second call does not rebuild', () => {
  const r = fakePlugin();
  const out = mkdtempSync(join(tmpdir(), 'xc-out-'));
  const target = () => join(out, 'staged');
  const first = stagePlugin(r, 'nohooks', target);
  writeFileSync(join(first, 'marker'), 'x');
  const second = stagePlugin(r, 'nohooks', target);
  assert.equal(second, first);
  assert.ok(existsSync(join(second, 'marker')));
});

test('the key includes name, version and short sha so updates invalidate it', () => {
  const r = fakePlugin();
  assert.equal(stageKey(r), 'superpowers-6.3.0-b36e082-nohooks');
});
