import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInstalled, findInstalled } from '../src/installed.ts';

const FIXTURE = {
  version: 2,
  plugins: {
    'superpowers@claude-plugins-official': [{
      scope: 'user',
      installPath: '/cache/claude-plugins-official/superpowers/6.3.0',
      version: '6.3.0',
      gitCommitSha: 'b36e0829c6d0140e93cfef2ca599b1b07d4a7797',
    }],
    'swift-lsp@claude-plugins-official': [{
      scope: 'user', installPath: '/cache/x/swift-lsp/1.0.0', version: '1.0.0',
    }],
  },
};

function fixtureFile(): string {
  const f = join(mkdtempSync(join(tmpdir(), 'xc-')), 'installed_plugins.json');
  writeFileSync(f, JSON.stringify(FIXTURE));
  return f;
}

test('parses id into bare name and keeps install metadata', () => {
  const rows = readInstalled(fixtureFile());
  const sp = rows.find(r => r.name === 'superpowers');
  assert.ok(sp);
  assert.equal(sp.id, 'superpowers@claude-plugins-official');
  assert.equal(sp.version, '6.3.0');
  assert.equal(sp.installPath, '/cache/claude-plugins-official/superpowers/6.3.0');
  assert.equal(sp.sha, 'b36e0829c6d0140e93cfef2ca599b1b07d4a7797');
});

test('missing gitCommitSha yields empty string, not undefined', () => {
  const row = readInstalled(fixtureFile()).find(r => r.name === 'swift-lsp');
  assert.equal(row?.sha, '');
});

test('findInstalled matches on bare name', () => {
  assert.equal(findInstalled('superpowers', fixtureFile())?.version, '6.3.0');
  assert.equal(findInstalled('nope', fixtureFile()), undefined);
});

test('absent manifest yields empty list rather than throwing', () => {
  assert.deepEqual(readInstalled('/nonexistent/installed_plugins.json'), []);
});
