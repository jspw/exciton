import { readFileSync } from 'node:fs';
import { userSettingsPath, projectSettingsPaths, managedSettingsPath } from './paths.ts';

export interface PluginScopeReport {
  /** Every plugin id seen in any readable scope. */
  ids: string[];
  /** Ids fixed by enterprise-managed settings; exciton cannot override these. */
  managedIds: string[];
}

function readEnabledPlugins(path: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { enabledPlugins?: Record<string, boolean> };
    return Object.keys(parsed.enabledPlugins ?? {});
  } catch {
    return []; // absent, unreadable, or malformed — skip the scope
  }
}

export function collectPluginIds(cwd: string): PluginScopeReport {
  const ids = new Set<string>();
  for (const p of [userSettingsPath(), ...projectSettingsPaths(cwd)]) {
    for (const id of readEnabledPlugins(p)) ids.add(id);
  }
  const managedIds = readEnabledPlugins(managedSettingsPath());
  for (const id of managedIds) ids.add(id);
  return { ids: [...ids].sort(), managedIds };
}

/** ONLY enabledPlugins. Any other key would outrank the user's project/local settings. */
export function buildDisablePayload(ids: string[]): string {
  const enabledPlugins: Record<string, boolean> = {};
  for (const id of [...ids].sort()) enabledPlugins[id] = false;
  return JSON.stringify({ enabledPlugins });
}
