import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { findInstalled as realFindInstalled, type InstalledPlugin } from './installed.ts';
import { findInMarketplaces as realFindInMarketplaces, type PluginSource } from './marketplace.ts';
import { cloneSource as realCloneSource, type Cloned } from './fetch.ts';
import { UserError } from './ui.ts';

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
  cloneSource: (name: string, src: PluginSource) => Cloned;
}

/** Exported so callers can tell a name they can judge from a path they cannot. */
export function isPathSpec(spec: string): boolean {
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

export interface ResolveOptions {
  /**
   * Skip the installed copy and resolve exciton's own clone.
   *
   * This is what makes `--own` mean anything: without it, a framework Claude
   * has installed would always win the lookup, and "keep an exciton copy" would
   * quietly hand back Claude's copy instead.
   */
  ownCopy?: boolean;
}

export function resolvePlugin(
  spec: string, deps: Partial<ResolveDeps> = {}, opts: ResolveOptions = {},
): Resolved {
  const d: ResolveDeps = {
    findInstalled: deps.findInstalled ?? (n => realFindInstalled(n)),
    findInMarketplaces: deps.findInMarketplaces ?? (n => realFindInMarketplaces(n)),
    cloneSource: deps.cloneSource ?? ((n, s) => realCloneSource(n, s)),
  };

  if (isPathSpec(spec)) {
    if (!existsSync(resolvePath(spec))) throw new UserError(`No such directory: ${spec}`);
    return fromDirectory(spec);
  }

  // Claude Code identifies a plugin as `name@marketplace`, and that is the
  // string people copy out of settings.json. exciton has no other meaning for
  // `@` — it does not select versions — so the marketplace half is ignored.
  const name = spec.split('@')[0];

  if (!opts.ownCopy) {
    const hit = d.findInstalled(name);
    if (hit) {
      return { name: hit.name, dir: hit.installPath, version: hit.version, sha: hit.sha, origin: 'installed' };
    }
  }

  const source = d.findInMarketplaces(name);
  if (!source) {
    throw new UserError(`Can't find ${name}`, [
      "It isn't installed through Claude, and no marketplace you have lists it.",
      'Run `exciton list` to see what exciton can run, or name a directory to use a ' +
      'local checkout.',
    ]);
  }
  const { dir, version } = d.cloneSource(name, source);
  return { name, dir, version, sha: '', origin: 'fetched' };
}
