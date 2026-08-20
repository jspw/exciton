import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findInMarketplaces } from '../src/marketplace.ts';

function marketplaceRoot(plugins: unknown[]): string {
  const root = mkdtempSync(join(tmpdir(), 'xc-mkt-'));
  const dir = join(root, 'official', '.claude-plugin');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'marketplace.json'), JSON.stringify({ name: 'official', plugins }));
  return root;
}

/** A manifest's pinned sha is ignored: exciton always takes the newest release. */
test('url source yields a git source, dropping any pinned sha', () => {
  const root = marketplaceRoot([{
    name: 'superpowers',
    source: { source: 'url', url: 'https://github.com/obra/superpowers.git', sha: 'b36e082' },
  }]);
  assert.deepEqual(findInMarketplaces('superpowers', root), {
    kind: 'git', url: 'https://github.com/obra/superpowers.git',
  });
});

test('github source is expanded to an https clone url', () => {
  const root = marketplaceRoot([{ name: 'x', source: { source: 'github', repo: 'owner/repo' } }]);
  assert.deepEqual(findInMarketplaces('x', root), {
    kind: 'git', url: 'https://github.com/owner/repo.git',
  });
});

test('command source is reported unsupported rather than silently mishandled', () => {
  const root = marketplaceRoot([{ name: 'x', source: { source: 'command', command: 'curl … | sh' } }]);
  const got = findInMarketplaces('x', root);
  assert.equal(got?.kind, 'unsupported');
  assert.match((got as { reason: string }).reason, /command/i);
});

test('unknown name yields undefined', () => {
  assert.equal(findInMarketplaces('absent', marketplaceRoot([])), undefined);
});

test('a malformed marketplace file does not abort the search', () => {
  const root = marketplaceRoot([{ name: 'x', source: { source: 'github', repo: 'o/r' } }]);
  const broken = join(root, 'broken', '.claude-plugin');
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, 'marketplace.json'), '{ not json');
  assert.equal(findInMarketplaces('x', root)?.kind, 'git');
});
