import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap, visibleLength, block, UserError } from '../src/ui.ts';

test('a line that already fits is left exactly as written', () => {
  assert.deepEqual(wrap('--own       an independent copy', 74),
    ['--own       an independent copy']);
});

/** Re-flowing a short line would collapse the padding that aligns it. */
test('deliberate alignment survives wrapping', () => {
  const table = '--use-installed   track Claude\'s copy\n--own             keep your own';
  assert.deepEqual(wrap(table, 74), [
    "--use-installed   track Claude's copy",
    '--own             keep your own',
  ]);
});

test('a long line is broken at word boundaries', () => {
  const lines = wrap('a '.repeat(60).trim(), 20);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 20, `"${l}" is ${l.length}`);
});

test('colour escapes do not count toward width', () => {
  assert.equal(visibleLength('\x1b[1mhello\x1b[0m'), 5);
});

test('a block indents its details under the headline', () => {
  const out = block('x', 'Headline', ['Detail one.']);
  assert.match(out, /^ {2}x {2}Headline\n\n {5}Detail one\.\n/);
});

/** Two blocks in a row must not run together. */
test('a block ends with a blank line so blocks can stack', () => {
  const stacked = block('a', 'First') + block('b', 'Second');
  assert.match(stacked, /First\n\n {2}b {2}Second/);
});

test('a user error renders its headline and every detail', () => {
  const text = new UserError('It broke', ['Because of this.', 'Try that.']).render();
  assert.match(text, /It broke/);
  assert.match(text, /Because of this\./);
  assert.match(text, /Try that\./);
});
