import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFramework, FRAMEWORKS, frameworkIdsIn } from '../src/frameworks.ts';

test('superpowers is the framework exciton manages today', () => {
  assert.equal(isFramework('superpowers'), true);
});

test('ordinary plugins are not managed and must be left alone', () => {
  for (const name of ['warp', 'understand-anything', 'ui-ux-pro-max', 'frontend-design', 'swift-lsp']) {
    assert.equal(isFramework(name), false, `${name} must not be managed`);
  }
});

test('the managed set is small and explicit — widening it is a deliberate act', () => {
  assert.deepEqual([...FRAMEWORKS], ['superpowers']);
});

const INSTALLED = [
  'frontend-design@claude-plugins-official',
  'superpowers@claude-plugins-official',
  'ui-ux-pro-max@ui-ux-pro-max-skill',
  'warp@claude-code-warp',
];

/**
 * Frameworks compete to govern a session, so running one means silencing the
 * rest — including ones the user did not name. Naming spec-kit while
 * superpowers stays globally enabled would produce the exact mixture exciton
 * exists to prevent.
 */
test('every managed framework is selected, named or not', () => {
  assert.deepEqual(frameworkIdsIn(INSTALLED), ['superpowers@claude-plugins-official']);
});

test('ordinary plugins are never selected — they compose, they do not compete', () => {
  const picked = frameworkIdsIn(INSTALLED);
  for (const stray of ['frontend-design', 'ui-ux-pro-max', 'warp']) {
    assert.ok(!picked.some(id => id.startsWith(stray)), `${stray} must not be selected`);
  }
});

test('a framework installed from two marketplaces yields both ids', () => {
  assert.deepEqual(
    frameworkIdsIn(['superpowers@official', 'superpowers@a-fork', 'warp@w']),
    ['superpowers@official', 'superpowers@a-fork'],
  );
});

test('no frameworks installed selects nothing', () => {
  assert.deepEqual(frameworkIdsIn(['warp@w', 'swift-lsp@s']), []);
});
