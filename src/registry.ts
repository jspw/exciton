import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { configPath } from './paths.ts';

/**
 * Where a framework runs from.
 *
 * `installed` tracks the copy Claude already manages — nothing to download, and
 * it stays current because Claude updates it. `own` is exciton's independent
 * clone of the newest release, which survives Claude uninstalling the plugin.
 */
export type Source = 'installed' | 'own';

export interface FrameworkEntry {
  source: Source;
}

export interface Registry {
  version: number;
  /**
   * When onboarding last completed, ISO-8601. Absent means it never has.
   *
   * This is what separates "never onboarded" from "onboarded and chose nothing"
   * — without it, anyone who deliberately adds no frameworks would be handed
   * the walkthrough again on every run.
   */
  onboardedAt?: string;
  frameworks: Record<string, FrameworkEntry>;
}

const CURRENT_VERSION = 1;

export function emptyRegistry(): Registry {
  return { version: CURRENT_VERSION, frameworks: {} };
}

/**
 * Reads the registry, treating anything unusable as absent.
 *
 * A corrupt config must not brick the tool: the registry is small and the user
 * can rebuild it by adding a framework again, whereas a hard failure would
 * leave exciton unusable until someone deleted a file by hand.
 */
export function readRegistry(file: string = configPath()): Registry {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Registry>;
    const frameworks: Record<string, FrameworkEntry> = {};
    for (const [name, entry] of Object.entries(parsed.frameworks ?? {})) {
      if (entry?.source === 'installed' || entry?.source === 'own') {
        frameworks[name] = { source: entry.source };
      }
    }
    return {
      version: typeof parsed.version === 'number' ? parsed.version : CURRENT_VERSION,
      ...(typeof parsed.onboardedAt === 'string' ? { onboardedAt: parsed.onboardedAt } : {}),
      frameworks,
    };
  } catch {
    return emptyRegistry();
  }
}

/** Writes atomically: a crash mid-write must not truncate the user's setup. */
export function writeRegistry(reg: Registry, file: string = configPath()): void {
  const staging = `${file}.tmp-${process.pid}`;
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(staging, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
    renameSync(staging, file);
  } catch (err) {
    rmSync(staging, { force: true });
    throw err;
  }
}

export function isOnboarded(reg: Registry): boolean {
  return typeof reg.onboardedAt === 'string';
}

export function markOnboarded(reg: Registry, now: Date = new Date()): Registry {
  return { ...reg, onboardedAt: now.toISOString() };
}

export function isAdded(reg: Registry, name: string): boolean {
  return name in reg.frameworks;
}

/** Sorted, so output and tests do not depend on insertion order. */
export function addedNames(reg: Registry): string[] {
  return Object.keys(reg.frameworks).sort();
}

export function addFramework(reg: Registry, name: string, source: Source): Registry {
  return { ...reg, frameworks: { ...reg.frameworks, [name]: { source } } };
}

export function removeFramework(reg: Registry, name: string): Registry {
  const frameworks = { ...reg.frameworks };
  delete frameworks[name];
  return { ...reg, frameworks };
}
