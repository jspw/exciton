import { spawnSync } from 'node:child_process';
import { UserError } from './ui.ts';

export interface LaunchPlan {
  disablePayload: string;
  pluginDirs: string[];
  forward: string[];
}

export type SpawnFn = (cmd: string, args: string[]) => { status: number | null; error?: Error };

const realSpawn: SpawnFn = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return { status: r.status, error: r.error };
};

export function buildClaudeArgs(plan: LaunchPlan): string[] {
  const args: string[] = [];
  // An empty payload means there is nothing to suppress. Omit the flag rather
  // than pass an empty object: --settings outranks project and local settings,
  // so a pass-through session must not assert it at all.
  if (plan.disablePayload) args.push('--settings', plan.disablePayload);
  for (const dir of plan.pluginDirs) args.push('--plugin-dir', dir);
  return [...args, ...plan.forward];
}

/**
 * Node has no execve, so this spawns claude with inherited stdio and forwards
 * the exit code. Ctrl-C reaches claude directly via the foreground process
 * group. Nothing on disk is per-session, so the parent has no cleanup to do.
 */
export function launch(plan: LaunchPlan, spawn: SpawnFn = realSpawn): number {
  const { status, error } = spawn('claude', buildClaudeArgs(plan));
  if (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new UserError('Could not run `claude`', [
        'Claude Code does not appear to be installed, or is not on your PATH.',
      ]);
    }
    throw error;
  }
  return status ?? 0;
}
