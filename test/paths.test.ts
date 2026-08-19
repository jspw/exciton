import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import {
  CLAUDE_DIR, EXCITON_DIR, userSettingsPath, projectSettingsPaths,
  installedPluginsPath, marketplacesDir, srcDir, stagedDir,
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
  assert.equal(srcDir('superpowers', 'abc1234'), `${homedir()}/.exciton/src/superpowers/abc1234`);
  assert.equal(stagedDir('superpowers-6.3.0-abc1234-nohooks'),
    `${homedir()}/.exciton/staged/superpowers-6.3.0-abc1234-nohooks`);
});
