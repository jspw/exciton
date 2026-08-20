import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { EXCITON_DIR } from '../paths.ts';
import { bold, dim, failure, note, success } from '../ui.ts';

export type ProcessLister = () => string;

/**
 * Claude Code marks liveness with `.in_use/<pid>` only inside the cache it owns
 * (`~/.claude/plugins/cache/`) — a --plugin-dir tree gets no marker, verified by
 * running a real session against one. So there is no flag on disk to read, and
 * the process table is the signal: an exciton-launched session carries
 * `--plugin-dir <exciton dir>` in its own argv.
 */
const psLister: ProcessLister = () => {
  try {
    return execFileSync('ps', ['-A', '-ww', '-o', 'pid=,args='], { encoding: 'utf8' });
  } catch {
    // No readable process table. Report nothing rather than refuse forever —
    // an unusable `clean` is a worse failure than the race it guards against.
    return '';
  }
};

/**
 * How many live sessions are running out of `root`.
 *
 * Both halves of the test matter. Requiring `--plugin-dir` keeps a command that
 * merely mentions the path — a grep, an editor, this project's own tests —
 * from reading as a session; requiring `root` keeps an ordinary `claude` with
 * some other plugin directory from reading as one of ours.
 */
export function liveSessions(root: string = EXCITON_DIR, list: ProcessLister = psLister): number {
  const mine = new Set([process.pid, process.ppid]);
  return list()
    .split('\n')
    .filter(line => {
      const m = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (!m || mine.has(Number(m[1]))) return false;
      return m[2].includes('--plugin-dir') && m[2].includes(root);
    })
    .length;
}

function inventory(root: string): { staged: number; clones: number } {
  const count = (p: string) => {
    try { return readdirSync(p).length; } catch { return 0; }
  };
  let clones = 0;
  try {
    for (const name of readdirSync(join(root, 'src'))) clones += count(join(root, 'src', name));
  } catch { /* no src/ yet */ }
  return { staged: count(join(root, 'staged')), clones };
}

export interface CleanOptions {
  root?: string;
  /** Clean despite live sessions — for a stuck process or a miscount. */
  force?: boolean;
  live?: () => number;
}

export function cleanCache(opts: CleanOptions = {}): number {
  const root = opts.root ?? EXCITON_DIR;
  const live = (opts.live ?? (() => liveSessions(root)))();

  if (live > 0 && !opts.force) {
    const one = live === 1;
    process.stderr.write(failure(
      `${live} live session${one ? '' : 's'} ${one ? 'is' : 'are'} running from the cache`,
      [
        `Cleaning now would delete the plugin tree${one ? '' : 's'} ` +
        `${one ? 'it is' : 'they are'} reading skills from, and ${one ? 'it' : 'they'} ` +
        `would start failing mid-task.`,
        `Close ${one ? 'it' : 'them'}, or re-run with ${bold('--force')}.`,
      ],
    ));
    return 1;
  }

  const { staged, clones } = inventory(root);
  for (const sub of ['staged', 'src']) {
    rmSync(join(root, sub), { recursive: true, force: true });
  }

  const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  process.stderr.write(
    staged === 0 && clones === 0
      ? note('The cache was already empty')
      : success(
        `Removed ${plural(staged, 'staged tree')} and ${plural(clones, 'cached clone')}`,
        [dim('Your added frameworks are untouched; they re-stage on the next run.')],
      ),
  );
  return 0;
}
