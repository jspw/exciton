import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readInstalled, type InstalledPlugin } from '../installed.ts';
import { collectPluginIds } from '../settings.ts';
import { FRAMEWORKS, isFramework } from '../frameworks.ts';
import { readRegistry, isAdded, type Source } from '../registry.ts';

export interface PluginRow {
  name: string;
  version: string;
  enabled: boolean;
  autoFires: boolean;
  /** False for a framework exciton supports but you have never installed. */
  installed: boolean;
  /** Where exciton runs it from, or undefined when it has not been added. */
  added?: Source;
}

export interface Sections {
  /** What exciton will run. Includes supported frameworks not yet on disk. */
  frameworks: PluginRow[];
  /** Everything else installed — reported, never touched. */
  others: PluginRow[];
}

export interface ListDeps {
  read: () => InstalledPlugin[];
  enabledIds: () => Set<string>;
  addedSource: (name: string) => Source | undefined;
}

function toRow(p: InstalledPlugin, enabled: Set<string>): PluginRow {
  return {
    name: p.name,
    version: p.version,
    enabled: enabled.has(p.id),
    autoFires: existsSync(join(p.installPath, 'hooks', 'hooks.json')),
    installed: true,
  };
}

const byName = (a: PluginRow, b: PluginRow) => a.name.localeCompare(b.name);

/**
 * Two questions, one command: which plugins inject into every session (there is
 * no built-in way to see this), and which names exciton will actually accept.
 * The split mirrors the distinction the product rests on — frameworks compete
 * to govern a session, ordinary plugins compose freely — so the answer to
 * "what can I type?" is the first thing on screen.
 */
export function buildSections(cwd: string, deps: Partial<ListDeps> = {}): Sections {
  const read = deps.read ?? (() => readInstalled());
  const enabledIds = deps.enabledIds ?? (() => new Set(collectPluginIds(cwd).ids));
  const addedSource = deps.addedSource ?? (() => {
    const reg = readRegistry();
    return (name: string) => isAdded(reg, name) ? reg.frameworks[name].source : undefined;
  })();

  const enabled = enabledIds();
  const rows = read().map(p => toRow(p, enabled));

  const frameworks = rows.filter(r => isFramework(r.name));
  const missing = [...FRAMEWORKS]
    .filter(name => !frameworks.some(r => r.name === name))
    .map(name => ({ name, version: '—', enabled: false, autoFires: false, installed: false }));

  return {
    frameworks: [...frameworks, ...missing]
      .map(r => ({ ...r, added: addedSource(r.name) }))
      .sort(byName),
    others: rows.filter(r => !isFramework(r.name)).sort(byName),
  };
}

function describeAdded(added: Source | undefined): string {
  if (!added) return 'no';
  return added === 'installed' ? "yes (Claude's copy)" : "yes (exciton's copy)";
}

/** The frameworks table leads with ADDED — it is what decides whether one runs. */
function frameworkTable(rows: PluginRow[], indent = '  '): string {
  const width = Math.max(4, ...rows.map(r => r.name.length));
  const head = `${indent}${'NAME'.padEnd(width)}  ${'ADDED'.padEnd(20)}  ` +
    `${'VERSION'.padEnd(9)}  AUTO-FIRES\n`;
  const body = rows
    .map(r =>
      `${indent}${r.name.padEnd(width)}  ${describeAdded(r.added).padEnd(20)}  ` +
      `${r.version.padEnd(9)}  ${r.autoFires ? 'SessionStart' : '—'}`)
    .join('\n');
  return rows.length === 0 ? head : `${head}${body}\n`;
}

function table(rows: PluginRow[], indent = '  '): string {
  const width = Math.max(4, ...rows.map(r => r.name.length));
  const head = `${indent}${'NAME'.padEnd(width)}  ${'VERSION'.padEnd(9)}  ${'ENABLED'.padEnd(7)}  AUTO-FIRES\n`;
  const body = rows
    .map(r =>
      `${indent}${r.name.padEnd(width)}  ${r.version.padEnd(9)}  ` +
      `${(r.enabled ? 'yes' : 'no').padEnd(7)}  ${r.autoFires ? 'SessionStart' : '—'}`)
    .join('\n');
  return rows.length === 0 ? head : `${head}${body}\n`;
}

export function formatSections(s: Sections): string {
  const out = ['FRAMEWORKS — exciton runs one of these per session\n',
    frameworkTable(s.frameworks)];

  const ready = s.frameworks.filter(r => r.added);
  const notAdded = s.frameworks.filter(r => !r.added);
  if (ready.length > 0) {
    out.push(`\n  Run: exciton ${ready[0].name} [--no-hooks]\n`);
  }
  if (notAdded.length > 0) {
    out.push(`\n  Add: exciton add ${notAdded[0].name}` +
      `${ready.length === 0 ? '   (nothing is added yet, so nothing will run)' : ''}\n`);
  }

  if (s.others.length > 0) {
    out.push('\nOTHER PLUGINS — untouched; your own settings govern these\n', table(s.others));
  }
  return out.join('');
}

export function listPlugins(cwd: string): number {
  process.stdout.write(formatSections(buildSections(cwd)));
  return 0;
}
