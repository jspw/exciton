import { readFileSync } from 'node:fs';
import { installedPluginsPath } from './paths.ts';

export interface InstalledPlugin {
  id: string;          // "superpowers@claude-plugins-official"
  name: string;        // "superpowers"
  installPath: string;
  version: string;
  sha: string;         // "" when the manifest records no gitCommitSha
}

interface Entry { installPath?: string; version?: string; gitCommitSha?: string }

export function readInstalled(file: string = installedPluginsPath()): InstalledPlugin[] {
  let parsed: { plugins?: Record<string, Entry[]> };
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  const out: InstalledPlugin[] = [];
  for (const [id, entries] of Object.entries(parsed.plugins ?? {})) {
    const e = entries?.[0];
    if (!e?.installPath) continue;
    out.push({
      id,
      name: id.split('@')[0],
      installPath: e.installPath,
      version: e.version ?? '0.0.0',
      sha: e.gitCommitSha ?? '',
    });
  }
  return out;
}

export function findInstalled(name: string, file?: string): InstalledPlugin | undefined {
  return readInstalled(file).find(p => p.name === name);
}
