import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { findInstalled as realFindInstalled, type InstalledPlugin } from './installed.ts';
import { findInMarketplaces as realFindInMarketplaces, type PluginSource } from './marketplace.ts';
import { cloneSource as realCloneSource } from './fetch.ts';

export interface Resolved {
  name: string;
  dir: string;
  version: string;
  sha: string;
  origin: 'installed' | 'fetched' | 'path';
}

export interface ResolveDeps {
  findInstalled: (name: string) => InstalledPlugin | undefined;
  findInMarketplaces: (name: string) => PluginSource | undefined;
  cloneSource: (name: string, src: PluginSource) => string;
}

function isPathSpec(spec: string): boolean {
  return spec.startsWith('/') || spec.startsWith('.') || spec.startsWith('~');
}

function fromDirectory(dir: string): Resolved {
  const abs = resolvePath(dir);
  let name = abs.split('/').pop() ?? 'plugin';
  let version = '0.0.0';
  try {
    const m = JSON.parse(readFileSync(join(abs, '.claude-plugin', 'plugin.json'), 'utf8'));
    if (m.name) name = m.name;
    if (m.version) version = m.version;
  } catch { /* a manifest is optional; fall back to the directory name */ }
  return { name, dir: abs, version, sha: '', origin: 'path' };
}

export function resolvePlugin(spec: string, deps: Partial<ResolveDeps> = {}): Resolved {
  const d: ResolveDeps = {
    findInstalled: deps.findInstalled ?? (n => realFindInstalled(n)),
    findInMarketplaces: deps.findInMarketplaces ?? (n => realFindInMarketplaces(n)),
    cloneSource: deps.cloneSource ?? ((n, s) => realCloneSource(n, s)),
  };

  if (isPathSpec(spec)) {
    if (!existsSync(resolvePath(spec))) throw new Error(`no such plugin directory: ${spec}`);
    return fromDirectory(spec);
  }

  const [name, ref] = spec.split('@');

  if (!ref) {
    const hit = d.findInstalled(name);
    if (hit) {
      return { name: hit.name, dir: hit.installPath, version: hit.version, sha: hit.sha, origin: 'installed' };
    }
  }

  const source = d.findInMarketplaces(name);
  if (!source) {
    throw new Error(
      `cannot resolve "${name}": not installed and not found in any marketplace. ` +
      `Try a path, or check the name with \`exciton list\`.`,
    );
  }
  const pinned: PluginSource = source.kind === 'git' && ref ? { ...source, sha: ref } : source;
  const dir = d.cloneSource(name, pinned);
  return {
    name,
    dir,
    version: ref ?? '0.0.0',
    sha: pinned.kind === 'git' ? pinned.sha : '',
    origin: 'fetched',
  };
}
