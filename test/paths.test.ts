import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import {
  CLAUDE_DIR, EXCITON_DIR, userSettingsPath, projectSettingsPaths,
  installedPluginsPath, marketplacesDir, srcDir, stagedDir, configPath,
} from '../src/paths.ts';

test('claude and exciton roots live under $HOME', () => {
  assert.equal(CLAUDE_DIR, `${homedir()}/.claude`);
  assert.equal(EXCITON_DIR, `${homedir()}/.exciton`);
});

test('claude state file paths', () => {
  assert.equal(userSettingsPath(), `${homedir()}/.claude/settings.json`);
  assert.equal(installedPluginsPath(), `${homedir()}/.claude/plugins/installed_plugins.json`);
  assert.equal(marketplacesDir(), `${homedir()}/.claude/plugins/marketplaces`);
});

test('project scopes are project then local, in precedence order', () => {
  assert.deepEqual(projectSettingsPaths('/repo'), [
    '/repo/.claude/settings.json',
    '/repo/.claude/settings.local.json',
  ]);
});

test('exciton cache paths are content-addressed', () => {
  assert.equal(srcDir('superpowers', '6.3.0'), `${homedir()}/.exciton/src/superpowers/6.3.0`);
  assert.equal(stagedDir('superpowers-6.3.0-abc1234-nohooks'),
    `${homedir()}/.exciton/staged/superpowers-6.3.0-abc1234-nohooks`);
});

/** `clean` empties staged/ and src/; the registry sits outside both, on purpose. */
test('the registry lives outside the directories clean empties', () => {
  assert.equal(configPath(), `${homedir()}/.exciton/config.json`);
  assert.ok(!configPath().startsWith(`${EXCITON_DIR}/staged`));
  assert.ok(!configPath().startsWith(`${EXCITON_DIR}/src`));
});
