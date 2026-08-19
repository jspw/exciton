import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { srcDir } from './paths.ts';
import type { PluginSource } from './marketplace.ts';

export type Runner = (cmd: string, args: string[], cwd?: string) => void;

const realRunner: Runner = (cmd, args, cwd) => {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
};

/** Clones `src` into exciton's own cache. Never touches ~/.claude. */
export function cloneSource(
  name: string,
  src: PluginSource,
  run: Runner = realRunner,
  resolveDir: (name: string, sha: string) => string = srcDir,
): string {
  if (src.kind === 'unsupported') {
    throw new Error(`cannot fetch "${name}": ${src.reason}`);
  }
  const key = src.sha ? src.sha.slice(0, 7) : 'head';
  const target = resolveDir(name, key);
  if (existsSync(target)) return target;

  const staging = `${target}.tmp-${process.pid}`;
  mkdirSync(dirname(target), { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  try {
    run('git', ['clone', '--depth', '1', src.url, staging]);
    if (src.sha) {
      run('git', ['fetch', '--depth', '1', 'origin', src.sha], staging);
      run('git', ['checkout', src.sha], staging);
    }
    renameSync(staging, target);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  return target;
}
