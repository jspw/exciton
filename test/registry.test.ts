import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readRegistry, writeRegistry, emptyRegistry, isOnboarded, markOnboarded,
  addFramework, removeFramework, isAdded, addedNames,
} from '../src/registry.ts';

function tempFile(name = 'config.json'): string {
  return join(mkdtempSync(join(tmpdir(), 'xc-reg-')), name);
}

test('a machine with no config reads as empty and never onboarded', () => {
  const reg = readRegistry(tempFile());
  assert.deepEqual(addedNames(reg), []);
  assert.equal(isOnboarded(reg), false);
});

/** A broken config must never brick the tool — it is small and rebuildable. */
test('an unreadable config reads as empty rather than throwing', () => {
  const file = tempFile();
  writeFileSync(file, '{ not json');
  assert.doesNotThrow(() => readRegistry(file));
  assert.equal(isOnboarded(readRegistry(file)), false);
});

test('a registry survives a write and read unchanged', () => {
  const file = tempFile();
  const reg = markOnboarded(addFramework(emptyRegistry(), 'superpowers', 'installed'));
  writeRegistry(reg, file);
  const back = readRegistry(file);
  assert.deepEqual(addedNames(back), ['superpowers']);
  assert.equal(back.frameworks.superpowers.source, 'installed');
  assert.equal(isOnboarded(back), true);
});

test('writing creates the exciton directory when it does not exist yet', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'xc-reg-')), 'nested', 'deep', 'config.json');
  writeRegistry(emptyRegistry(), file);
  assert.ok(existsSync(file));
});

test('writing leaves no temporary file behind', () => {
  const file = tempFile();
  writeRegistry(emptyRegistry(), file);
  assert.deepEqual(readdirSync(join(file, '..')), ['config.json']);
});

/**
 * The distinction the whole onboarding flow rests on: someone who deliberately
 * added nothing has still been onboarded, and must not be asked again.
 */
test('choosing zero frameworks still counts as onboarded', () => {
  const reg = markOnboarded(emptyRegistry());
  assert.deepEqual(addedNames(reg), []);
  assert.equal(isOnboarded(reg), true);
});

test('onboarding records when it happened', () => {
  const at = new Date('2026-08-20T12:00:00.000Z');
  assert.equal(markOnboarded(emptyRegistry(), at).onboardedAt, '2026-08-20T12:00:00.000Z');
});

test('adding records which copy the framework runs from', () => {
  const reg = addFramework(emptyRegistry(), 'superpowers', 'own');
  assert.equal(isAdded(reg, 'superpowers'), true);
  assert.equal(reg.frameworks.superpowers.source, 'own');
});

test('adding again with a different source switches it', () => {
  const reg = addFramework(addFramework(emptyRegistry(), 'superpowers', 'own'), 'superpowers', 'installed');
  assert.deepEqual(addedNames(reg), ['superpowers'], 'switching must not duplicate the entry');
  assert.equal(reg.frameworks.superpowers.source, 'installed');
});

test('removing takes it out of the registry', () => {
  const reg = removeFramework(addFramework(emptyRegistry(), 'superpowers', 'own'), 'superpowers');
  assert.equal(isAdded(reg, 'superpowers'), false);
  assert.deepEqual(addedNames(reg), []);
});

test('removing something that was never added changes nothing', () => {
  assert.deepEqual(addedNames(removeFramework(emptyRegistry(), 'ghost')), []);
});

test('added names come back in a stable order', () => {
  let reg = emptyRegistry();
  for (const n of ['spec-kit', 'superpowers', 'bmad']) reg = addFramework(reg, n, 'own');
  assert.deepEqual(addedNames(reg), ['bmad', 'spec-kit', 'superpowers']);
});

/** Mutators return a new registry, so a caller can hold the prior state. */
test('adding and removing leave the original registry untouched', () => {
  const before = addFramework(emptyRegistry(), 'superpowers', 'own');
  addFramework(before, 'bmad', 'own');
  removeFramework(before, 'superpowers');
  assert.deepEqual(addedNames(before), ['superpowers']);
});

test('an onboarded registry stays onboarded across edits', () => {
  const reg = addFramework(markOnboarded(emptyRegistry()), 'superpowers', 'own');
  assert.equal(isOnboarded(reg), true);
});
