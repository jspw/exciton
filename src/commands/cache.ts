import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { EXCITON_DIR } from '../paths.ts';
import { resolvePlugin } from '../resolve.ts';
import { stagePlugin } from '../stage.ts';

export function cleanCache(root: string = EXCITON_DIR): number {
  for (const sub of ['staged', 'src']) {
    rmSync(join(root, sub), { recursive: true, force: true });
  }
  process.stderr.write('exciton: cache cleared\n');
  return 0;
}

/** Warm the cache so a later `exciton <name>` starts instantly and works offline. */
export function prefetch(names: string[]): number {
  if (names.length === 0) {
    process.stderr.write('exciton: nothing to fetch — name at least one plugin\n');
    return 1;
  }
  for (const name of names) {
    const resolved = resolvePlugin(name);
    stagePlugin(resolved, 'nohooks');
    process.stderr.write(`exciton: cached ${resolved.name} ${resolved.version} (${resolved.origin})\n`);
  }
  return 0;
}
