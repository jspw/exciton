import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface HookReport {
  registered: number;   // "Registered N hooks from M plugins"  — actual registration
  injected: number;     // "provided additionalContext"          — actual EXECUTION
  skillsFrom: string;   // where superpowers skills resolved from
}

/**
 * NEVER assert on "Read hooks.json for plugin X" — that line is plugin
 * DISCOVERY and appears for plugins that are never registered. Misreading it
 * produced two reversed conclusions during design. See MECHANISM.md §7.
 */
export function runClaude(args: string[]): HookReport {
  const log = join(mkdtempSync(join(tmpdir(), 'xc-int-')), 'debug.log');
  execFileSync('claude', ['--debug-file', log, '-p', 'hi', ...args], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const text = readFileSync(log, 'utf8');
  return {
    registered: Number(/Registered (\d+) hooks/.exec(text)?.[1] ?? 0),
    injected: (text.match(/provided additionalContext/g) ?? []).length,
    skillsFrom: /load skills from plugin superpowers \w+ skillsPath: (.+)/.exec(text)?.[1] ?? '',
  };
}
