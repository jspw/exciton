import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { srcDir } from './paths.ts';
import type { PluginSource } from './marketplace.ts';
import { UserError, note } from './ui.ts';

export type Runner = (cmd: string, args: string[], cwd?: string) => void;
export type Capture = (cmd: string, args: string[]) => string;

export interface Cloned {
  dir: string;
  /** The released version actually cloned, without its `v`, or `0.0.0`. */
  version: string;
}

export interface FetchDeps {
  run: Runner;
  capture: Capture;
  resolveDir: (name: string, key: string) => string;
  /**
   * Progress, as plain text.
   *
   * The caller decides how it looks: inside the walkthrough this becomes a step
   * on the rail, and on its own it becomes a block. Emitting formatted output
   * from here would force one shape on both.
   */
  say: (text: string) => void;
}

/**
 * Runs git without letting it write to the terminal.
 *
 * Inheriting stdio dumped clone progress and git's detached-HEAD lecture into
 * the middle of the walkthrough. Nothing there is actionable while it succeeds
 * — and everything there is actionable when it fails, so failure keeps it.
 */
const realRunner: Runner = (cmd, args, cwd) => {
  try {
    execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const detail = (err as { stderr?: Buffer }).stderr?.toString().trim();
    throw new UserError(
      `Could not fetch from git`,
      detail ? [detail] : ['`git` failed without saying why.'],
    );
  }
};

const realCapture: Capture = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return ''; // unreachable remote, no tags — the caller falls back to the branch
  }
};

/** `1.2.3` / `v1.2.3` → [1,2,3]. Anything else — a pre-release, a moving name
 *  like `nightly` — is not a release and does not compete for "latest". */
function release(tag: string): number[] | undefined {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/**
 * The newest released tag in a remote, or '' if it publishes none.
 *
 * `--refs` drops the `^{}` dereference lines that `ls-remote` otherwise emits
 * for annotated tags. Ordering is numeric per component, because sorting these
 * as strings puts v6.10.0 below v6.2.0.
 */
export function latestTag(url: string, capture: Capture = realCapture): string {
  const lines = capture('git', ['ls-remote', '--tags', '--refs', url]).split('\n');
  let best: { tag: string; parts: number[] } | undefined;

  for (const line of lines) {
    const tag = line.split('refs/tags/')[1]?.trim();
    if (!tag) continue;
    const parts = release(tag);
    if (parts && (!best || isNewer(parts, best.parts))) best = { tag, parts };
  }
  return best?.tag ?? '';
}

function isNewer(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Clones the newest release of `src` into exciton's cache. Never touches ~/.claude. */
export function cloneSource(name: string, src: PluginSource, deps: Partial<FetchDeps> = {}): Cloned {
  const run = deps.run ?? realRunner;
  const capture = deps.capture ?? realCapture;
  const resolveDir = deps.resolveDir ?? srcDir;
  const say = deps.say ?? (text => process.stderr.write(note(text)));

  if (src.kind === 'unsupported') {
    throw new Error(`cannot fetch "${name}": ${src.reason}`);
  }

  const tag = latestTag(src.url, capture);
  const version = tag ? tag.replace(/^v/, '') : '0.0.0';
  const target = resolveDir(name, tag ? version : 'head');
  if (existsSync(target)) return { dir: target, version };

  say(`Fetching ${name} ${tag || 'latest'}`);

  const staging = `${target}.tmp-${process.pid}`;
  mkdirSync(dirname(target), { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  try {
    // One shallow clone straight at the tag: no second fetch, no checkout, and
    // nothing that depends on how upstream spells its tag names. --quiet and
    // the advice flag keep git from narrating into our output.
    run('git', [
      '-c', 'advice.detachedHead=false',
      'clone', '--depth', '1', '--quiet',
      ...(tag ? ['--branch', tag] : []),
      src.url, staging,
    ]);
    renameSync(staging, target);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  return { dir: target, version };
}
