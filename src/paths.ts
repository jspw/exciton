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

/**
 * The registry of added frameworks. Deliberately outside `staged/` and `src/`,
 * the two directories `clean` empties — your setup is not disposable cache.
 */
export function configPath(): string {
  return join(EXCITON_DIR, 'config.json');
}

export function srcDir(name: string, key: string): string {
  return join(EXCITON_DIR, 'src', name, key);
}

export function stagedDir(key: string): string {
  return join(EXCITON_DIR, 'staged', key);
}
