import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRows } from '../src/commands/list.ts';

const ROWS = [
  { name: 'superpowers', version: '6.3.0', enabled: true, autoFires: true },
  { name: 'swift-lsp', version: '1.0.0', enabled: false, autoFires: false },
];

test('renders a header and one line per plugin', () => {
  const lines = formatRows(ROWS).trimEnd().split('\n');
  assert.match(lines[0], /NAME\s+VERSION\s+ENABLED\s+AUTO-FIRES/);
  assert.equal(lines.length, 3);
});

test('marks which plugins inject into every session', () => {
  const out = formatRows(ROWS);
  assert.match(out, /superpowers\s+6\.3\.0\s+yes\s+SessionStart/);
  assert.match(out, /swift-lsp\s+1\.0\.0\s+no\s+—/);
});

test('an empty list still renders the header', () => {
  assert.match(formatRows([]), /NAME/);
});
