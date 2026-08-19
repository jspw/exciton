import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { stagedDir } from './paths.ts';
import type { Resolved } from './resolve.ts';

export type Profile = 'full' | 'nohooks';

/** Always excluded: runtime state and VCS metadata. */
const ALWAYS_EXCLUDE = new Set(['.git', '.in_use']);

export function stageKey(r: Resolved): string {
  const short = r.sha ? r.sha.slice(0, 7) : 'nosha';
  return `${r.name}-${r.version}-${short}-nohooks`;
}

/**
 * `full` points --plugin-dir at the source in place (zero copy).
 * `nohooks` builds a copy with hooks/ removed, atomically, once per key.
 * Never chmods the result: Claude Code writes .in_use/<pid> into plugin trees.
 */
export function stagePlugin(
  r: Resolved,
  profile: Profile,
  target: (key: string) => string = stagedDir,
): string {
  if (profile === 'full') return r.dir;

  const dest = target(stageKey(r));
  if (existsSync(dest)) return dest;

  const staging = `${dest}.tmp-${process.pid}`;
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  try {
    cpSync(r.dir, staging, {
      recursive: true,
      dereference: false,
      filter: (src) => {
        const rel = relative(r.dir, src);
        if (rel === '') return true;
        const top = rel.split('/')[0];
        if (ALWAYS_EXCLUDE.has(top)) return false;
        return top !== 'hooks';
      },
    });
    renameSync(staging, dest);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  return dest;
}
