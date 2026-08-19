import { homedir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_DIR = join(homedir(), '.claude');
export const EXCITON_DIR = join(homedir(), '.exciton');

export function userSettingsPath(): string {
  return join(CLAUDE_DIR, 'settings.json');
}

/** Project scope then local scope, in ascending precedence order. */
export function projectSettingsPaths(cwd: string): string[] {
  return [join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json')];
}

export function managedSettingsPath(): string {
  return process.platform === 'darwin'
    ? '/Library/Application Support/ClaudeCode/managed-settings.json'
    : '/etc/claude-code/managed-settings.json';
}

export function installedPluginsPath(): string {
  return join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
}

export function marketplacesDir(): string {
  return join(CLAUDE_DIR, 'plugins', 'marketplaces');
}

export function srcDir(name: string, sha: string): string {
  return join(EXCITON_DIR, 'src', name, sha);
}

export function stagedDir(key: string): string {
  return join(EXCITON_DIR, 'staged', key);
}
