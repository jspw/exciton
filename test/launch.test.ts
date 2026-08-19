import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs, launch } from '../src/launch.ts';

const PAYLOAD = '{"enabledPlugins":{"a@m":false}}';

test('emits --settings once with the disable payload', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: [], forward: [] });
  assert.equal(args.filter(a => a === '--settings').length, 1);
  assert.equal(args[args.indexOf('--settings') + 1], PAYLOAD);
});

test('the settings payload carries only enabledPlugins', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: [], forward: [] });
  const parsed = JSON.parse(args[args.indexOf('--settings') + 1]);
  assert.deepEqual(Object.keys(parsed), ['enabledPlugins']);
});

test('emits one --plugin-dir per staged directory, in order', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: ['/a', '/b'], forward: [] });
  assert.deepEqual(
    args.filter((a, i) => args[i - 1] === '--plugin-dir'),
    ['/a', '/b'],
  );
});

/**
 * With nothing to suppress, exciton must not pass --settings at all. The flag
 * outranks project and local settings, so an empty payload is still a claim on
 * precedence that a pass-through session has no business making.
 */
test('nothing to suppress means no --settings flag at all', () => {
  const args = buildClaudeArgs({ disablePayload: '', pluginDirs: [], forward: [] });
  assert.equal(args.includes('--settings'), false);
  assert.deepEqual(args, []);
});

test('a pass-through still forwards claude args', () => {
  const args = buildClaudeArgs({ disablePayload: '', pluginDirs: [], forward: ['--model', 'opus'] });
  assert.deepEqual(args, ['--model', 'opus']);
});

test('forwarded args come last so they can override', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: ['/a'], forward: ['--model', 'opus'] });
  assert.deepEqual(args.slice(-2), ['--model', 'opus']);
});

test('launch returns the child exit status', () => {
  const status = launch(
    { disablePayload: PAYLOAD, pluginDirs: [], forward: [] },
    () => ({ status: 3, error: undefined }),
  );
  assert.equal(status, 3);
});

test('a missing claude binary produces an actionable error', () => {
  assert.throws(
    () => launch({ disablePayload: PAYLOAD, pluginDirs: [], forward: [] },
      () => ({ status: null, error: Object.assign(new Error('spawn'), { code: 'ENOENT' }) })),
    /claude.*PATH/i,
  );
});
