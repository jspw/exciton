import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readInstalled } from '../installed.ts';
import { collectPluginIds } from '../settings.ts';

export interface PluginRow {
  name: string;
  version: string;
  enabled: boolean;
  autoFires: boolean;
}

export function buildRows(cwd: string): PluginRow[] {
  const enabledIds = new Set(collectPluginIds(cwd).ids);
  return readInstalled()
    .map(p => ({
      name: p.name,
      version: p.version,
      enabled: enabledIds.has(p.id),
      autoFires: existsSync(join(p.installPath, 'hooks', 'hooks.json')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatRows(rows: PluginRow[]): string {
  const width = Math.max(4, ...rows.map(r => r.name.length));
  const header = `${'NAME'.padEnd(width)}  ${'VERSION'.padEnd(9)}  ${'ENABLED'.padEnd(7)}  AUTO-FIRES\n`;
  const body = rows
    .map(r =>
      `${r.name.padEnd(width)}  ${r.version.padEnd(9)}  ${(r.enabled ? 'yes' : 'no').padEnd(7)}  ` +
      `${r.autoFires ? 'SessionStart' : '—'}`)
    .join('\n');
  return rows.length === 0 ? header : `${header}${body}\n`;
}

export function listPlugins(cwd: string): number {
  process.stdout.write(formatRows(buildRows(cwd)));
  return 0;
}
