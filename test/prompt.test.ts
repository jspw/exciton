import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeLines, collapsedLines, keyHint, isInteractive, type Choice } from '../src/prompt.ts';

/** Just the choice rows: skip the heading, hint, and spacer lines. */
function rows(lines: string[]): string[] {
  return lines.filter(l => l.includes('superpowers') || l.includes('bmad'));
}

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
  const lines = rows(activeLines('Q', CHOICES, 0, new Set()));
  for (const line of lines) assert.match(line, /\[ \]/);
});

test('a selected choice is visibly ticked', () => {
  const lines = rows(activeLines('Q', CHOICES, 0, new Set(['superpowers'])));
  assert.match(lines[0], /\[✓\]/);
  assert.match(lines[1], /\[ \]/);
});

test('single-select draws no boxes, only a pointer', () => {
  const lines = rows(activeLines('Q', CHOICES, 1));
  assert.doesNotMatch(lines.join('\n'), /\[/);
  assert.match(lines[1], /›/);
});

test('the pointer marks the active row and only that row', () => {
  const lines = rows(activeLines('Q', CHOICES, 1, new Set()));
  assert.doesNotMatch(lines[0], /›/);
  assert.match(lines[1], /›/);
});

test('hints are shown beside their choice', () => {
  assert.match(rows(activeLines('Q', CHOICES, 0, new Set()))[0], /already installed/);
});

test('labels are padded to a common width so hints line up', () => {
  const lines = rows(activeLines('Q', CHOICES, 0, new Set()));
  assert.equal(lines[0].indexOf('already'), lines[1].indexOf('not installed'));
});

/** Prompting without a terminal would block on a key that never arrives. */
test('interactivity requires a terminal on both stdin and stderr', () => {
  assert.equal(isInteractive(), Boolean(process.stdin.isTTY && process.stderr.isTTY));
});

/** The walkthrough is one flow, so every line of it hangs off one gutter. */
test('an active question is drawn on the rail', () => {
  const lines = activeLines('Which one?', CHOICES, 0, new Set());
  assert.match(lines[0], /◆/);
  assert.match(lines[0], /Which one\?/);
  for (const l of lines.slice(1)) assert.match(l, /│/);
});

/** Leaving the full list on screen turned the walkthrough into a log. */
test('an answered question collapses to the question and the answer', () => {
  const lines = collapsedLines('Which copy?', 'An exciton copy');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /◇/);
  assert.match(lines[0], /Which copy\?/);
  assert.match(lines[1], /An exciton copy/);
});

test('collapsing is strictly shorter than the question it replaces', () => {
  const open = activeLines('Which copy?', CHOICES, 0);
  assert.ok(collapsedLines('Which copy?', 'x').length < open.length);
});

test('choosing nothing collapses to something rather than a blank', () => {
  assert.match(collapsedLines('Which ones?', '')[1], /nothing/);
});
