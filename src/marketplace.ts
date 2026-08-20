import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marketplacesDir } from './paths.ts';

export type PluginSource =
  | { kind: 'git'; url: string }
  | { kind: 'unsupported'; reason: string };

interface Entry { name?: string; source?: { source?: string; url?: string; repo?: string } }

/** Only the location matters: exciton always takes a framework's newest release. */
function toSource(entry: Entry): PluginSource {
  const s = entry.source ?? {};
  if (s.source === 'url' && s.url) return { kind: 'git', url: s.url };
  if (s.source === 'github' && s.repo) {
    return { kind: 'git', url: `https://github.com/${s.repo}.git` };
  }
  if (s.source === 'command') {
    return {
      kind: 'unsupported',
      reason: 'this plugin installs by running a marketplace-declared command, which exciton cannot reproduce',
    };
  }
  return { kind: 'unsupported', reason: `unrecognised marketplace source type "${s.source ?? 'none'}"` };
}

export function findInMarketplaces(name: string, root: string = marketplacesDir()): PluginSource | undefined {
  let markets: string[];
  try {
    markets = readdirSync(root);
  } catch {
    return undefined;
  }
  for (const market of markets) {
    let entries: Entry[];
    try {
      const raw = readFileSync(join(root, market, '.claude-plugin', 'marketplace.json'), 'utf8');
      entries = (JSON.parse(raw) as { plugins?: Entry[] }).plugins ?? [];
    } catch {
      continue; // absent or malformed marketplace — try the next one
    }
    const hit = entries.find(e => e.name === name);
    if (hit) return toSource(hit);
  }
  return undefined;
}
