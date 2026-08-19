import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runClaude } from './helpers.ts';
import { collectPluginIds, buildDisablePayload } from '../../src/settings.ts';
import { resolvePlugin } from '../../src/resolve.ts';
import { stagePlugin } from '../../src/stage.ts';
import { frameworkIdsIn } from '../../src/frameworks.ts';

const skip = { skip: !hasSuperpowers() };
function hasSuperpowers(): boolean {
  try { return !!resolvePlugin('superpowers'); } catch { return false; }
}

/**
 * The payload exciton actually sends: every managed framework's ids, named or
 * not, so no unnamed framework keeps governing the session. Ordinary plugin
 * ids are absent, leaving the user's own settings to govern them.
 */
let payload: string;
let baselineHooks: number;
before(() => {
  const { ids } = collectPluginIds(process.cwd());
  payload = buildDisablePayload(frameworkIdsIn(ids));
  baselineHooks = runClaude([]).registered;
});

test('baseline: superpowers installed and enabled injects', skip, () => {
  assert.ok(runClaude([]).injected >= 1);
});

test('the payload names superpowers and nothing else', skip, () => {
  const parsed = JSON.parse(payload) as { enabledPlugins: Record<string, boolean> };
  assert.deepEqual(Object.keys(parsed), ['enabledPlugins']);
  const names = Object.keys(parsed.enabledPlugins).map(id => id.split('@')[0]);
  assert.deepEqual([...new Set(names)], ['superpowers']);
  assert.ok(Object.values(parsed.enabledPlugins).every(v => v === false));
});

/**
 * The load-bearing behavior. superpowers' own hook must vanish while every
 * other plugin's hooks keep registering — hence the relative assertion against
 * the measured baseline rather than a hard-coded count, which is machine-specific.
 *
 * Note this deliberately does NOT assert `injected === 0`: other plugins still
 * provide additionalContext, and suppressing them is no longer exciton's job.
 */
test('exciton superpowers --no-hooks: superpowers goes silent, other plugins do not', skip, () => {
  const dir = stagePlugin(resolvePlugin('superpowers'), 'nohooks');
  const r = runClaude(['--settings', payload, '--plugin-dir', dir]);
  assert.equal(r.registered, baselineHooks - 1, "only superpowers' hook may disappear");
  assert.match(r.skillsFrom, /staged/, 'skills must come from the staged copy');
});

test('exciton superpowers: the framework is present and does not double-inject', skip, () => {
  const dir = stagePlugin(resolvePlugin('superpowers'), 'full');
  const r = runClaude(['--settings', payload, '--plugin-dir', dir]);
  assert.equal(r.registered, baselineHooks, 'the staged copy replaces the installed one');
  assert.equal(r.injected, 1, 'must not double-inject');
});

/** exciton suppresses only what it replaces; everything else is untouched. */
test('unnamed plugins keep their hooks under --no-hooks', skip, () => {
  const dir = stagePlugin(resolvePlugin('superpowers'), 'nohooks');
  const r = runClaude(['--settings', payload, '--plugin-dir', dir]);
  assert.ok(baselineHooks > 1, 'precondition: another plugin registers hooks here');
  assert.ok(r.registered > 0, 'other plugins must still register their hooks');
});

test('integrity: no Claude state file is modified', skip, () => {
  const files = [
    `${process.env.HOME}/.claude/settings.json`,
    `${process.env.HOME}/.claude/plugins/installed_plugins.json`,
    `${process.env.HOME}/.claude/plugins/known_marketplaces.json`,
  ];
  const sum = () => files.map(f => execFileSync('shasum', [f]).toString());
  const before = sum();
  const dir = stagePlugin(resolvePlugin('superpowers'), 'nohooks');
  runClaude(['--settings', payload, '--plugin-dir', dir]);
  assert.deepEqual(sum(), before);
});
