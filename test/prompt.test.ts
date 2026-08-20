import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceLines, keyHint, isInteractive, type Choice } from '../src/prompt.ts';

const CHOICES: Choice[] = [
  { value: 'superpowers', label: 'superpowers', hint: 'already installed · 6.3.0' },
  { value: 'bmad', label: 'bmad', hint: 'not installed yet' },
];

/**
 * The first person to meet this prompt pressed enter and chose nothing, never
 * learning space was the key. The hint is the fix, so it is pinned here.
 */
test('a multi-select says which key selects, and that none is allowed', () => {
  const hint = keyHint(true);
  assert.match(hint, /space/);
  assert.match(hint, /enter/);
  assert.match(hint, /none is fine/);
});

test('a single-select does not offer a select key it does not have', () => {
  assert.doesNotMatch(keyHint(false), /space/);
  assert.match(keyHint(false), /enter/);
});

/** A bare space gave no sign that selecting was even possible. */
test('multi-select draws an explicit box for every choice', () => {
  const lines = choiceLines(CHOICES, 0, new Set());
  for (const line of lines) assert.match(line, /\[ \]/);
});

test('a selected choice is visibly ticked', () => {
  const lines = choiceLines(CHOICES, 0, new Set(['superpowers']));
  assert.match(lines[0], /\[✓\]/);
  assert.match(lines[1], /\[ \]/);
});

test('single-select draws no boxes, only a pointer', () => {
  const lines = choiceLines(CHOICES, 1);
  assert.doesNotMatch(lines.join('\n'), /\[/);
  assert.match(lines[1], /›/);
});

test('the pointer marks the active row and only that row', () => {
  const lines = choiceLines(CHOICES, 1, new Set());
  assert.doesNotMatch(lines[0], /›/);
  assert.match(lines[1], /›/);
});

test('hints are shown beside their choice', () => {
  assert.match(choiceLines(CHOICES, 0, new Set())[0], /already installed/);
});

test('labels are padded to a common width so hints line up', () => {
  const lines = choiceLines(CHOICES, 0, new Set());
  assert.equal(lines[0].indexOf('already'), lines[1].indexOf('not installed'));
});

/** Prompting without a terminal would block on a key that never arrives. */
test('interactivity requires a terminal on both stdin and stderr', () => {
  assert.equal(isInteractive(), Boolean(process.stdin.isTTY && process.stderr.isTTY));
});
