import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanCache } from '../src/commands/cache.ts';

function populatedCache(): string {
  const root = mkdtempSync(join(tmpdir(), 'xc-cache-'));
  mkdirSync(join(root, 'staged', 'sp-6.3.0-abc-nohooks'), { recursive: true });
  mkdirSync(join(root, 'src', 'sp', 'abc1234'), { recursive: true });
  writeFileSync(join(root, 'staged', 'sp-6.3.0-abc-nohooks', 'f'), 'x');
  return root;
}

test('removes both cache directories', () => {
  const root = populatedCache();
  assert.equal(cleanCache(root), 0);
  assert.equal(existsSync(join(root, 'staged')), false);
  assert.equal(existsSync(join(root, 'src')), false);
});

test('leaves the exciton root itself in place', () => {
  const root = populatedCache();
  cleanCache(root);
  assert.ok(existsSync(root));
});

test('cleaning an empty cache succeeds', () => {
  assert.equal(cleanCache(mkdtempSync(join(tmpdir(), 'xc-empty-'))), 0);
});
