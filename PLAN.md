# exciton v1 Implementation Plan

> ## ⚠️ EXECUTED AND PARTLY SUPERSEDED — 2026-08-16
>
> All 12 tasks were built and are passing (74 unit + 6 integration tests). **This document is now a historical record, not a specification.** The code deviates from it in the following ways; where they disagree, **the code and [MECHANISM.md](MECHANISM.md) are correct.**
>
> **1 · Scope reversed — the big one.** The architecture line below, Task 2, and Task 9 all specify *disable every enabled plugin, then add back what was named*. That was built, tested against a live session, and **rejected**. exciton suppresses **only the frameworks it manages and you named** (`src/frameworks.ts`, currently `{superpowers}`); every other plugin id is absent from the payload and keeps working normally. Task 2's `collectPluginIds` still enumerates all scopes — correctly — but `idsForNames` now selects from that list.
>
> **2 · Bare `exciton` is a usage error**, not "a session with no plugins". With nothing named the launch would be identical to plain `claude`. It prints help and exits 1.
>
> **3 · `--settings` is omitted entirely when there is nothing to suppress**, rather than passed as an empty object — the flag outranks project and local settings.
>
> **4 · `-h`/`--help` and `-v`/`--version` exist.** Task 9's parser rejected every unknown flag, including `-h`.
>
> **5 · Module specifiers.** Task 1 says `src/` files import each other as `./paths.js` with `allowImportingTsExtensions: false`. That fails under Node's type stripping (`ERR_MODULE_NOT_FOUND`). Sources import `./paths.ts`; tsconfig sets `allowImportingTsExtensions` **and** `rewriteRelativeImportExtensions` to `true`, so `tsc` emits `.js`. Requires TypeScript ≥ 5.7 (plan said `^5.6.0`).
>
> **6 · `@types/node` is a devDependency.** The plan says "`typescript` is the only devDependency"; without node types `tsc` resolves no `node:` builtin and `strict` is inert. Dev-only — the zero-runtime-dependency rule is intact.
>
> **7 · Task 9's `cli.ts` shipped a dead binary.** No shebang, and `import.meta.url === \`file://${process.argv[1]}\`` is false through npm's bin symlink, so `exciton` did nothing at all. Fixed via `isMainModule()` plus `#!/usr/bin/env node`.
>
> **8 · Node 22.18+ needs no flag.** The global constraint's `--experimental-strip-types` fallback for Node 22.6–23.5 is unnecessary; type stripping was unflagged in 22.18. Built and tested on v22.23.1.
>
> **9 · Task 12's assertions changed** with the scope reversal. `injected === 0` is no longer correct — other plugins still inject, and suppressing them is not exciton's job. Hook counts are now asserted relative to a measured baseline rather than hard-coded.
>
> Task 8's `spawnSync`-instead-of-`exec` deviation, flagged below in the original text, has been amended in [MECHANISM.md](MECHANISM.md) § Stage 4.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `exciton`, a CLI that launches Claude Code with exactly the plugins you name — nothing else — for one session, without modifying any Claude Code state.

**Architecture:** ~~Parse argv → collect every enabled plugin id across Claude's settings scopes → resolve each named plugin to a directory (installed → marketplace-cloned → explicit path) → stage it (`full` = the directory as-is; `--no-hooks` = a copy with `hooks/` removed) → launch `claude` with `--settings '{"enabledPlugins":{…all false}}'` plus one `--plugin-dir` per named plugin.~~

**Architecture (as built):** Parse argv → resolve each named plugin to a directory (installed → marketplace-cloned → explicit path) → **refuse any plugin not in `FRAMEWORKS`** → collect every enabled plugin id across Claude's settings scopes, then **select only the ids belonging to the named frameworks** → stage each (`full` = the directory as-is; `--no-hooks` = a copy with `hooks/` removed) → launch `claude` with `--settings '{"enabledPlugins":{<named framework ids>:false}}'` plus one `--plugin-dir` per named plugin. Unnamed plugins never appear in the payload.

**Tech Stack:** TypeScript on Node ≥ 24, published as `exciton` with bins `exciton` and `exciton`. **Zero runtime dependencies** — only `node:fs`, `node:path`, `node:os`, `node:child_process`. Tests use the built-in `node:test` runner. `typescript` is the only devDependency.

**Spec:** [MECHANISM.md](MECHANISM.md) (mechanism, verified behavior, testing rules) · [PRODUCT.md](PRODUCT.md) (surface, scope, non-goals) · [QA.md](QA.md) (rationale)

## Global Constraints

Every task's requirements implicitly include these.

- **Node ≥ 24.** Runs `.ts` sources directly via native type stripping. On Node 22.6–23.5 add `--experimental-strip-types` to every `node` invocation.
- **Zero runtime dependencies.** Node builtins only. `typescript` is devDependency-only.
- **Test command is `node --test --test-concurrency=2`.** The concurrency cap is mandatory — this machine has 24 GB / 12 cores and uncapped runners have triggered macOS jetsam three times.
- **POSIX only** (macOS + Linux). No Windows path handling.
- **Never write anywhere under `~/.claude/`.** exciton reads Claude's state and writes only inside `~/.exciton/`.
- **Never invoke `claude plugin install`** or any `claude plugin` mutation. Plugins install enabled by default, which would activate the framework in every ordinary session.
- **The `--settings` payload contains only `enabledPlugins`.** No other key, ever. `--settings` outranks local, project, and user settings, so passing anything else silently inverts the user's own precedence.
- **Staged copies must preserve `plugin.json`'s `name`.** `--plugin-dir` precedence is keyed on the plugin name; renaming breaks shadowing.
- **When staging, exclude `hooks/` (nohooks profile only), plus `.git/` and `.in_use/` always.** Never make staged trees read-only — Claude Code writes `.in_use/<pid>` liveness markers into plugin directories.
- **Package name `exciton`; bins `exciton` and `exciton`.** Bare `exciton` and `exciton-cli` on npm are taken.

**Known deviation from the spec:** [MECHANISM.md](MECHANISM.md) § 3 Stage 4 specifies a real `exec` so exciton replaces itself. Node has no `execve`. Task 8 uses `spawnSync` with `stdio: 'inherit'` and forwards the exit code, leaving a resident ~30 MB parent that does nothing but wait. This is behaviourally equivalent here (nothing needs cleanup, and Ctrl-C reaches `claude` via the foreground process group), but the spec sentence should be amended when this plan is executed.

---

### Task 1: Project scaffold and path helpers

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `src/paths.ts`
- Test: `test/paths.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CLAUDE_DIR: string`, `EXCITON_DIR: string`, `userSettingsPath(): string`, `projectSettingsPaths(cwd: string): string[]`, `managedSettingsPath(): string`, `installedPluginsPath(): string`, `marketplacesDir(): string`, `srcDir(name: string, sha: string): string`, `stagedDir(key: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// test/paths.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import {
  CLAUDE_DIR, EXCITON_DIR, userSettingsPath, projectSettingsPaths,
  installedPluginsPath, marketplacesDir, srcDir, stagedDir,
} from '../src/paths.ts';

test('claude and exciton roots live under $HOME', () => {
  assert.equal(CLAUDE_DIR, `${homedir()}/.claude`);
  assert.equal(EXCITON_DIR, `${homedir()}/.exciton`);
});

test('claude state file paths', () => {
  assert.equal(userSettingsPath(), `${homedir()}/.claude/settings.json`);
  assert.equal(installedPluginsPath(), `${homedir()}/.claude/plugins/installed_plugins.json`);
  assert.equal(marketplacesDir(), `${homedir()}/.claude/plugins/marketplaces`);
});

test('project scopes are project then local, in precedence order', () => {
  assert.deepEqual(projectSettingsPaths('/repo'), [
    '/repo/.claude/settings.json',
    '/repo/.claude/settings.local.json',
  ]);
});

test('exciton cache paths are content-addressed', () => {
  assert.equal(srcDir('superpowers', 'abc1234'), `${homedir()}/.exciton/src/superpowers/abc1234`);
  assert.equal(stagedDir('superpowers-6.3.0-abc1234-nohooks'),
    `${homedir()}/.exciton/staged/superpowers-6.3.0-abc1234-nohooks`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/paths.test.ts`
Expected: FAIL — `Cannot find module '../src/paths.ts'`

- [ ] **Step 3: Write scaffold and implementation**

```json
// package.json
{
  "name": "exciton",
  "version": "0.1.0",
  "description": "Run Claude Code with exactly the plugins you name — for one session.",
  "type": "module",
  "engines": { "node": ">=24" },
  "bin": { "exciton": "./dist/cli.js", "exciton": "./dist/cli.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "node --test --test-concurrency=2 test/*.test.ts",
    "test:integration": "node --test --test-concurrency=2 test/integration/*.test.ts"
  },
  "devDependencies": { "typescript": "^5.6.0" },
  "license": "MIT"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "declaration": false,
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts"]
}
```

```
# .gitignore
node_modules/
dist/
```

```ts
// src/paths.ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_DIR = join(homedir(), '.claude');
export const EXCITON_DIR = join(homedir(), '.exciton');

export function userSettingsPath(): string {
  return join(CLAUDE_DIR, 'settings.json');
}

/** Project scope then local scope, in ascending precedence order. */
export function projectSettingsPaths(cwd: string): string[] {
  return [join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json')];
}

export function managedSettingsPath(): string {
  return process.platform === 'darwin'
    ? '/Library/Application Support/ClaudeCode/managed-settings.json'
    : '/etc/claude-code/managed-settings.json';
}

export function installedPluginsPath(): string {
  return join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
}

export function marketplacesDir(): string {
  return join(CLAUDE_DIR, 'plugins', 'marketplaces');
}

export function srcDir(name: string, sha: string): string {
  return join(EXCITON_DIR, 'src', name, sha);
}

export function stagedDir(key: string): string {
  return join(EXCITON_DIR, 'staged', key);
}
```

Note: `import '../src/paths.ts'` in tests requires the `.ts` extension because Node resolves the real file; `tsconfig` sets `allowImportingTsExtensions: false` because `src/` files import each other with `.js` extensions for the compiled output. In `src/`, always import as `./paths.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/paths.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore src/paths.ts test/paths.test.ts
git commit -m "feat: project scaffold and path helpers"
```

---

### Task 2: Collect enabled plugin ids across settings scopes

Building the disable payload requires every plugin id Claude might enable — from user, project, **and** local scopes. Missing a scope silently leaves that plugin active.

**Files:**
- Create: `src/settings.ts`
- Test: `test/settings.test.ts`

**Interfaces:**
- Consumes: `userSettingsPath`, `projectSettingsPaths`, `managedSettingsPath` from `src/paths.ts`
- Produces: `interface PluginScopeReport { ids: string[]; managedIds: string[] }`, `collectPluginIds(cwd: string): PluginScopeReport`, `buildDisablePayload(ids: string[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// test/settings.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectPluginIds, buildDisablePayload } from '../src/settings.ts';

function repoWith(project: object | null, local: object | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'xc-'));
  mkdirSync(join(dir, '.claude'), { recursive: true });
  if (project) writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify(project));
  if (local) writeFileSync(join(dir, '.claude', 'settings.local.json'), JSON.stringify(local));
  return dir;
}

test('unions ids from project and local scopes', () => {
  const dir = repoWith(
    { enabledPlugins: { 'a@m': true } },
    { enabledPlugins: { 'b@m': true } },
  );
  const { ids } = collectPluginIds(dir);
  assert.ok(ids.includes('a@m'));
  assert.ok(ids.includes('b@m'));
});

test('includes ids already set to false, so the payload is exhaustive', () => {
  const dir = repoWith({ enabledPlugins: { 'a@m': false } }, null);
  assert.ok(collectPluginIds(dir).ids.includes('a@m'));
});

test('ids are unique and sorted for a stable payload', () => {
  const dir = repoWith(
    { enabledPlugins: { 'b@m': true, 'a@m': true } },
    { enabledPlugins: { 'a@m': true } },
  );
  const { ids } = collectPluginIds(dir);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), ids);
});

test('missing or malformed settings files are skipped, not fatal', () => {
  const dir = repoWith(null, null);
  writeFileSync(join(dir, '.claude', 'settings.json'), '{ not json');
  assert.doesNotThrow(() => collectPluginIds(dir));
});

test('payload contains only enabledPlugins, every value false', () => {
  const payload = JSON.parse(buildDisablePayload(['a@m', 'b@m']));
  assert.deepEqual(Object.keys(payload), ['enabledPlugins']);
  assert.deepEqual(payload.enabledPlugins, { 'a@m': false, 'b@m': false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/settings.test.ts`
Expected: FAIL — `Cannot find module '../src/settings.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/settings.ts
import { readFileSync } from 'node:fs';
import { userSettingsPath, projectSettingsPaths, managedSettingsPath } from './paths.js';

export interface PluginScopeReport {
  /** Every plugin id seen in any readable scope. */
  ids: string[];
  /** Ids fixed by enterprise-managed settings; exciton cannot override these. */
  managedIds: string[];
}

function readEnabledPlugins(path: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { enabledPlugins?: Record<string, boolean> };
    return Object.keys(parsed.enabledPlugins ?? {});
  } catch {
    return []; // absent, unreadable, or malformed — skip the scope
  }
}

export function collectPluginIds(cwd: string): PluginScopeReport {
  const ids = new Set<string>();
  for (const p of [userSettingsPath(), ...projectSettingsPaths(cwd)]) {
    for (const id of readEnabledPlugins(p)) ids.add(id);
  }
  const managedIds = readEnabledPlugins(managedSettingsPath());
  for (const id of managedIds) ids.add(id);
  return { ids: [...ids].sort(), managedIds };
}

/** ONLY enabledPlugins. Any other key would outrank the user's project/local settings. */
export function buildDisablePayload(ids: string[]): string {
  const enabledPlugins: Record<string, boolean> = {};
  for (const id of [...ids].sort()) enabledPlugins[id] = false;
  return JSON.stringify({ enabledPlugins });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/settings.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts test/settings.test.ts
git commit -m "feat: collect enabled plugin ids across settings scopes"
```

---

### Task 3: Read installed plugins (resolution tier 1)

**Files:**
- Create: `src/installed.ts`
- Test: `test/installed.test.ts`

**Interfaces:**
- Consumes: `installedPluginsPath` from `src/paths.ts`
- Produces: `interface InstalledPlugin { id: string; name: string; installPath: string; version: string; sha: string }`, `readInstalled(file?: string): InstalledPlugin[]`, `findInstalled(name: string, file?: string): InstalledPlugin | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// test/installed.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInstalled, findInstalled } from '../src/installed.ts';

const FIXTURE = {
  version: 2,
  plugins: {
    'superpowers@claude-plugins-official': [{
      scope: 'user',
      installPath: '/cache/claude-plugins-official/superpowers/6.3.0',
      version: '6.3.0',
      gitCommitSha: 'b36e0829c6d0140e93cfef2ca599b1b07d4a7797',
    }],
    'swift-lsp@claude-plugins-official': [{
      scope: 'user', installPath: '/cache/x/swift-lsp/1.0.0', version: '1.0.0',
    }],
  },
};

function fixtureFile(): string {
  const f = join(mkdtempSync(join(tmpdir(), 'xc-')), 'installed_plugins.json');
  writeFileSync(f, JSON.stringify(FIXTURE));
  return f;
}

test('parses id into bare name and keeps install metadata', () => {
  const rows = readInstalled(fixtureFile());
  const sp = rows.find(r => r.name === 'superpowers');
  assert.ok(sp);
  assert.equal(sp.id, 'superpowers@claude-plugins-official');
  assert.equal(sp.version, '6.3.0');
  assert.equal(sp.installPath, '/cache/claude-plugins-official/superpowers/6.3.0');
  assert.equal(sp.sha, 'b36e0829c6d0140e93cfef2ca599b1b07d4a7797');
});

test('missing gitCommitSha yields empty string, not undefined', () => {
  const row = readInstalled(fixtureFile()).find(r => r.name === 'swift-lsp');
  assert.equal(row?.sha, '');
});

test('findInstalled matches on bare name', () => {
  assert.equal(findInstalled('superpowers', fixtureFile())?.version, '6.3.0');
  assert.equal(findInstalled('nope', fixtureFile()), undefined);
});

test('absent manifest yields empty list rather than throwing', () => {
  assert.deepEqual(readInstalled('/nonexistent/installed_plugins.json'), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/installed.test.ts`
Expected: FAIL — `Cannot find module '../src/installed.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/installed.ts
import { readFileSync } from 'node:fs';
import { installedPluginsPath } from './paths.js';

export interface InstalledPlugin {
  id: string;          // "superpowers@claude-plugins-official"
  name: string;        // "superpowers"
  installPath: string;
  version: string;
  sha: string;         // "" when the manifest records no gitCommitSha
}

interface Entry { installPath?: string; version?: string; gitCommitSha?: string }

export function readInstalled(file: string = installedPluginsPath()): InstalledPlugin[] {
  let parsed: { plugins?: Record<string, Entry[]> };
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  const out: InstalledPlugin[] = [];
  for (const [id, entries] of Object.entries(parsed.plugins ?? {})) {
    const e = entries?.[0];
    if (!e?.installPath) continue;
    out.push({
      id,
      name: id.split('@')[0],
      installPath: e.installPath,
      version: e.version ?? '0.0.0',
      sha: e.gitCommitSha ?? '',
    });
  }
  return out;
}

export function findInstalled(name: string, file?: string): InstalledPlugin | undefined {
  return readInstalled(file).find(p => p.name === name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/installed.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/installed.ts test/installed.test.ts
git commit -m "feat: read installed plugins manifest"
```

---

### Task 4: Resolve a plugin name to a git source via marketplace manifests

**Files:**
- Create: `src/marketplace.ts`
- Test: `test/marketplace.test.ts`

**Interfaces:**
- Consumes: `marketplacesDir` from `src/paths.ts`
- Produces: `type PluginSource = { kind: 'git'; url: string; sha: string } | { kind: 'unsupported'; reason: string }`, `findInMarketplaces(name: string, root?: string): PluginSource | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// test/marketplace.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findInMarketplaces } from '../src/marketplace.ts';

function marketplaceRoot(plugins: unknown[]): string {
  const root = mkdtempSync(join(tmpdir(), 'xc-mkt-'));
  const dir = join(root, 'official', '.claude-plugin');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'marketplace.json'), JSON.stringify({ name: 'official', plugins }));
  return root;
}

test('url source yields a git source with its pinned sha', () => {
  const root = marketplaceRoot([{
    name: 'superpowers',
    source: { source: 'url', url: 'https://github.com/obra/superpowers.git', sha: 'b36e082' },
  }]);
  assert.deepEqual(findInMarketplaces('superpowers', root), {
    kind: 'git', url: 'https://github.com/obra/superpowers.git', sha: 'b36e082',
  });
});

test('github source is expanded to an https clone url', () => {
  const root = marketplaceRoot([{ name: 'x', source: { source: 'github', repo: 'owner/repo' } }]);
  assert.deepEqual(findInMarketplaces('x', root), {
    kind: 'git', url: 'https://github.com/owner/repo.git', sha: '',
  });
});

test('command source is reported unsupported rather than silently mishandled', () => {
  const root = marketplaceRoot([{ name: 'x', source: { source: 'command', command: 'curl … | sh' } }]);
  const got = findInMarketplaces('x', root);
  assert.equal(got?.kind, 'unsupported');
  assert.match((got as { reason: string }).reason, /command/i);
});

test('unknown name yields undefined', () => {
  assert.equal(findInMarketplaces('absent', marketplaceRoot([])), undefined);
});

test('a malformed marketplace file does not abort the search', () => {
  const root = marketplaceRoot([{ name: 'x', source: { source: 'github', repo: 'o/r' } }]);
  const broken = join(root, 'broken', '.claude-plugin');
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, 'marketplace.json'), '{ not json');
  assert.equal(findInMarketplaces('x', root)?.kind, 'git');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/marketplace.test.ts`
Expected: FAIL — `Cannot find module '../src/marketplace.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/marketplace.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { marketplacesDir } from './paths.js';

export type PluginSource =
  | { kind: 'git'; url: string; sha: string }
  | { kind: 'unsupported'; reason: string };

interface Entry { name?: string; source?: { source?: string; url?: string; repo?: string; sha?: string } }

function toSource(entry: Entry): PluginSource {
  const s = entry.source ?? {};
  if (s.source === 'url' && s.url) return { kind: 'git', url: s.url, sha: s.sha ?? '' };
  if (s.source === 'github' && s.repo) {
    return { kind: 'git', url: `https://github.com/${s.repo}.git`, sha: s.sha ?? '' };
  }
  if (s.source === 'command') {
    return {
      kind: 'unsupported',
      reason: 'this plugin installs by running a marketplace-declared command, which exciton cannot reproduce',
    };
  }
  return { kind: 'unsupported', reason: `unrecognised marketplace source type "${s.source ?? 'none'}"` };
}

export function findInMarketplaces(name: string, root: string = marketplacesDir()): PluginSource | undefined {
  let markets: string[];
  try {
    markets = readdirSync(root);
  } catch {
    return undefined;
  }
  for (const market of markets) {
    let entries: Entry[];
    try {
      const raw = readFileSync(join(root, market, '.claude-plugin', 'marketplace.json'), 'utf8');
      entries = (JSON.parse(raw) as { plugins?: Entry[] }).plugins ?? [];
    } catch {
      continue; // absent or malformed marketplace — try the next one
    }
    const hit = entries.find(e => e.name === name);
    if (hit) return toSource(hit);
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/marketplace.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/marketplace.ts test/marketplace.test.ts
git commit -m "feat: resolve plugin names to git sources via marketplace manifests"
```

---

### Task 5: Clone a git source into exciton's own cache (resolution tier 2)

**Files:**
- Create: `src/fetch.ts`
- Test: `test/fetch.test.ts`

**Interfaces:**
- Consumes: `PluginSource` from `src/marketplace.ts`; `srcDir` from `src/paths.ts`
- Produces: `cloneSource(name: string, src: PluginSource, run?: Runner): string`, `type Runner = (cmd: string, args: string[], cwd?: string) => void`

- [ ] **Step 1: Write the failing test**

```ts
// test/fetch.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneSource } from '../src/fetch.ts';

/** Records invocations, and creates the clone target so renameSync can succeed. */
function fakeRun(calls: string[][]) {
  return (cmd: string, args: string[], _cwd?: string) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'clone') mkdirSync(args[args.length - 1], { recursive: true });
  };
}

/** Keeps every test inside a temp dir — never touches the real ~/.exciton. */
function tempCache(): (name: string, sha: string) => string {
  const root = mkdtempSync(join(tmpdir(), 'xc-cache-'));
  return (name, sha) => join(root, 'src', name, sha);
}

test('clones shallow and checks out the pinned sha', () => {
  const calls: string[][] = [];
  const dir = cloneSource(
    'superpowers',
    { kind: 'git', url: 'https://example.com/sp.git', sha: 'abc1234def' },
    fakeRun(calls),
    tempCache(),
  );
  assert.match(dir, /\/src\/superpowers\/abc1234$/);
  assert.equal(calls[0][0], 'git');
  assert.ok(calls[0].includes('clone'));
  assert.ok(calls[0].includes('--depth'));
  assert.ok(calls.some(c => c.includes('checkout') && c.includes('abc1234def')));
});

test('without a pinned sha it clones the default branch under "head"', () => {
  const calls: string[][] = [];
  const dir = cloneSource(
    'x', { kind: 'git', url: 'https://example.com/x.git', sha: '' },
    fakeRun(calls), tempCache(),
  );
  assert.match(dir, /\/src\/x\/head$/);
  assert.ok(!calls.some(c => c.includes('checkout')));
});

test('an unsupported source fails loudly with the stated reason', () => {
  assert.throws(
    () => cloneSource('x', { kind: 'unsupported', reason: 'declared command' }, () => {}, tempCache()),
    /declared command/,
  );
});

test('a failed clone leaves no partial directory behind', () => {
  const resolveDir = tempCache();
  assert.throws(() => cloneSource(
    'x', { kind: 'git', url: 'u', sha: 'abc1234' },
    () => { throw new Error('network down'); },
    resolveDir,
  ), /network down/);
  assert.equal(existsSync(resolveDir('x', 'abc1234')), false);
});

test('an existing cache directory short-circuits the clone', () => {
  const resolveDir = tempCache();
  mkdirSync(resolveDir('x', 'abc1234'), { recursive: true });
  const calls: string[][] = [];
  const dir = cloneSource('x', { kind: 'git', url: 'u', sha: 'abc1234' }, fakeRun(calls), resolveDir);
  assert.equal(dir, resolveDir('x', 'abc1234'));
  assert.equal(calls.length, 0);
});
```

Add `existsSync` to the `node:fs` import above.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/fetch.test.ts`
Expected: FAIL — `Cannot find module '../src/fetch.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/fetch.ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { srcDir } from './paths.js';
import type { PluginSource } from './marketplace.js';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/fetch.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/fetch.ts test/fetch.test.ts
git commit -m "feat: clone marketplace-resolved sources into exciton cache"
```

---

### Task 6: Unified three-tier resolver

**Files:**
- Create: `src/resolve.ts`
- Test: `test/resolve.test.ts`

**Interfaces:**
- Consumes: `findInstalled` (`src/installed.ts`), `findInMarketplaces` (`src/marketplace.ts`), `cloneSource` (`src/fetch.ts`)
- Produces: `interface Resolved { name: string; dir: string; version: string; sha: string; origin: 'installed' | 'fetched' | 'path' }`, `interface ResolveDeps {…}`, `resolvePlugin(spec: string, deps?: Partial<ResolveDeps>): Resolved`

- [ ] **Step 1: Write the failing test**

```ts
// test/resolve.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePlugin } from '../src/resolve.ts';

const installed = {
  id: 'superpowers@claude-plugins-official', name: 'superpowers',
  installPath: '/cache/superpowers/6.3.0', version: '6.3.0', sha: 'b36e0829aaa',
};

test('tier 1: an installed plugin resolves with no network access', () => {
  let fetched = false;
  const r = resolvePlugin('superpowers', {
    findInstalled: () => installed,
    cloneSource: () => { fetched = true; return '/never'; },
  });
  assert.equal(r.origin, 'installed');
  assert.equal(r.dir, '/cache/superpowers/6.3.0');
  assert.equal(fetched, false);
});

test('tier 2: an uninstalled plugin is fetched from its marketplace source', () => {
  const r = resolvePlugin('superpowers', {
    findInstalled: () => undefined,
    findInMarketplaces: () => ({ kind: 'git', url: 'https://x/sp.git', sha: 'abc1234def' }),
    cloneSource: () => '/exciton/src/superpowers/abc1234',
  });
  assert.equal(r.origin, 'fetched');
  assert.equal(r.dir, '/exciton/src/superpowers/abc1234');
  assert.equal(r.sha, 'abc1234def');
});

test('an explicit ref forces tier 2 even when installed', () => {
  const r = resolvePlugin('superpowers@6.2.0', {
    findInstalled: () => installed,
    findInMarketplaces: () => ({ kind: 'git', url: 'https://x/sp.git', sha: '' }),
    cloneSource: () => '/exciton/src/superpowers/6.2.0',
  });
  assert.equal(r.origin, 'fetched');
});

test('tier 3: a filesystem path resolves to itself and reads its manifest name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xc-plug-'));
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'my-plugin', version: '1.2.3' }));
  const r = resolvePlugin(dir, {});
  assert.equal(r.origin, 'path');
  assert.equal(r.name, 'my-plugin');
  assert.equal(r.version, '1.2.3');
  assert.equal(r.dir, dir);
});

test('an unresolvable name errors with the name in the message', () => {
  assert.throws(
    () => resolvePlugin('ghost', { findInstalled: () => undefined, findInMarketplaces: () => undefined }),
    /ghost/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/resolve.test.ts`
Expected: FAIL — `Cannot find module '../src/resolve.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/resolve.ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { findInstalled as realFindInstalled, type InstalledPlugin } from './installed.js';
import { findInMarketplaces as realFindInMarketplaces, type PluginSource } from './marketplace.js';
import { cloneSource as realCloneSource } from './fetch.js';

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
  cloneSource: (name: string, src: PluginSource) => string;
}

function isPathSpec(spec: string): boolean {
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

export function resolvePlugin(spec: string, deps: Partial<ResolveDeps> = {}): Resolved {
  const d: ResolveDeps = {
    findInstalled: deps.findInstalled ?? (n => realFindInstalled(n)),
    findInMarketplaces: deps.findInMarketplaces ?? (n => realFindInMarketplaces(n)),
    cloneSource: deps.cloneSource ?? ((n, s) => realCloneSource(n, s)),
  };

  if (isPathSpec(spec)) {
    if (!existsSync(resolvePath(spec))) throw new Error(`no such plugin directory: ${spec}`);
    return fromDirectory(spec);
  }

  const [name, ref] = spec.split('@');

  if (!ref) {
    const hit = d.findInstalled(name);
    if (hit) {
      return { name: hit.name, dir: hit.installPath, version: hit.version, sha: hit.sha, origin: 'installed' };
    }
  }

  const source = d.findInMarketplaces(name);
  if (!source) {
    throw new Error(
      `cannot resolve "${name}": not installed and not found in any marketplace. ` +
      `Try a path, or check the name with \`exciton list\`.`,
    );
  }
  const pinned: PluginSource = source.kind === 'git' && ref ? { ...source, sha: ref } : source;
  const dir = d.cloneSource(name, pinned);
  return {
    name,
    dir,
    version: ref ?? '0.0.0',
    sha: pinned.kind === 'git' ? pinned.sha : '',
    origin: 'fetched',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/resolve.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/resolve.ts test/resolve.test.ts
git commit -m "feat: three-tier plugin resolver"
```

---

### Task 7: Stage a resolved plugin for the requested profile

**Files:**
- Create: `src/stage.ts`
- Test: `test/stage.test.ts`

**Interfaces:**
- Consumes: `Resolved` from `src/resolve.ts`; `stagedDir` from `src/paths.ts`
- Produces: `type Profile = 'full' | 'nohooks'`, `stageKey(r: Resolved): string`, `stagePlugin(r: Resolved, profile: Profile, target?: (key: string) => string): string`

- [ ] **Step 1: Write the failing test**

```ts
// test/stage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stagePlugin, stageKey } from '../src/stage.ts';
import type { Resolved } from '../src/resolve.ts';

function fakePlugin(): Resolved {
  const dir = mkdtempSync(join(tmpdir(), 'xc-sp-'));
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'superpowers', version: '6.3.0' }));
  mkdirSync(join(dir, 'skills', 'brainstorming'), { recursive: true });
  writeFileSync(join(dir, 'skills', 'brainstorming', 'SKILL.md'), '# skill');
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  writeFileSync(join(dir, 'hooks', 'hooks.json'), '{"hooks":{}}');
  mkdirSync(join(dir, '.in_use'), { recursive: true });
  writeFileSync(join(dir, '.in_use', '1234'), '');
  return { name: 'superpowers', dir, version: '6.3.0', sha: 'b36e0829aaa', origin: 'installed' };
}

test('full profile returns the source directory untouched — zero copy', () => {
  const r = fakePlugin();
  assert.equal(stagePlugin(r, 'full'), r.dir);
});

test('nohooks profile copies skills but omits hooks/ and .in_use/', () => {
  const r = fakePlugin();
  const out = mkdtempSync(join(tmpdir(), 'xc-out-'));
  const dir = stagePlugin(r, 'nohooks', () => join(out, 'staged'));
  assert.ok(existsSync(join(dir, 'skills', 'brainstorming', 'SKILL.md')));
  assert.ok(!existsSync(join(dir, 'hooks')));
  assert.ok(!existsSync(join(dir, '.in_use')));
});

test('nohooks staging preserves plugin.json name — precedence depends on it', () => {
  const r = fakePlugin();
  const out = mkdtempSync(join(tmpdir(), 'xc-out-'));
  const dir = stagePlugin(r, 'nohooks', () => join(out, 'staged'));
  const manifest = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'superpowers');
});

test('staging is idempotent — a second call does not rebuild', () => {
  const r = fakePlugin();
  const out = mkdtempSync(join(tmpdir(), 'xc-out-'));
  const target = () => join(out, 'staged');
  const first = stagePlugin(r, 'nohooks', target);
  writeFileSync(join(first, 'marker'), 'x');
  const second = stagePlugin(r, 'nohooks', target);
  assert.equal(second, first);
  assert.ok(existsSync(join(second, 'marker')));
});

test('the key includes name, version and short sha so updates invalidate it', () => {
  const r = fakePlugin();
  assert.equal(stageKey(r), 'superpowers-6.3.0-b36e082-nohooks');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/stage.test.ts`
Expected: FAIL — `Cannot find module '../src/stage.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/stage.ts
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { stagedDir } from './paths.js';
import type { Resolved } from './resolve.js';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/stage.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/stage.ts test/stage.test.ts
git commit -m "feat: stage plugins for full and nohooks profiles"
```

---

### Task 8: Build the claude argv and launch

**Files:**
- Create: `src/launch.ts`
- Test: `test/launch.test.ts`

**Interfaces:**
- Consumes: nothing (pure argv construction plus a spawn wrapper)
- Produces: `interface LaunchPlan { disablePayload: string; pluginDirs: string[]; forward: string[] }`, `buildClaudeArgs(plan: LaunchPlan): string[]`, `launch(plan: LaunchPlan, spawn?: SpawnFn): number`

- [ ] **Step 1: Write the failing test**

```ts
// test/launch.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaudeArgs, launch } from '../src/launch.ts';

const PAYLOAD = '{"enabledPlugins":{"a@m":false}}';

test('emits --settings once with the disable payload', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: [], forward: [] });
  assert.equal(args.filter(a => a === '--settings').length, 1);
  assert.equal(args[args.indexOf('--settings') + 1], PAYLOAD);
});

test('the settings payload carries only enabledPlugins', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: [], forward: [] });
  const parsed = JSON.parse(args[args.indexOf('--settings') + 1]);
  assert.deepEqual(Object.keys(parsed), ['enabledPlugins']);
});

test('emits one --plugin-dir per staged directory, in order', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: ['/a', '/b'], forward: [] });
  assert.deepEqual(
    args.filter((a, i) => args[i - 1] === '--plugin-dir'),
    ['/a', '/b'],
  );
});

test('forwarded args come last so they can override', () => {
  const args = buildClaudeArgs({ disablePayload: PAYLOAD, pluginDirs: ['/a'], forward: ['--model', 'opus'] });
  assert.deepEqual(args.slice(-2), ['--model', 'opus']);
});

test('launch returns the child exit status', () => {
  const status = launch(
    { disablePayload: PAYLOAD, pluginDirs: [], forward: [] },
    () => ({ status: 3, error: undefined }),
  );
  assert.equal(status, 3);
});

test('a missing claude binary produces an actionable error', () => {
  assert.throws(
    () => launch({ disablePayload: PAYLOAD, pluginDirs: [], forward: [] },
      () => ({ status: null, error: Object.assign(new Error('spawn'), { code: 'ENOENT' }) })),
    /claude.*PATH/i,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/launch.test.ts`
Expected: FAIL — `Cannot find module '../src/launch.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/launch.ts
import { spawnSync } from 'node:child_process';

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
  const args = ['--settings', plan.disablePayload];
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
      throw new Error('could not run `claude` — is Claude Code installed and on your PATH?');
    }
    throw error;
  }
  return status ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/launch.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/launch.ts test/launch.test.ts
git commit -m "feat: build claude argv and launch the session"
```

---

### Task 9: CLI argument parsing and the run command

First task that produces a working `exciton`.

**Files:**
- Create: `src/cli.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `collectPluginIds`, `buildDisablePayload` (`src/settings.ts`); `resolvePlugin` (`src/resolve.ts`); `stagePlugin` (`src/stage.ts`); `launch` (`src/launch.ts`)
- Produces: `interface ParsedArgs { command: 'run' | 'list' | 'clean' | 'fetch'; names: string[]; profile: Profile; forward: string[] }`, `parseArgs(argv: string[]): ParsedArgs`, `run(argv: string[]): number`

- [ ] **Step 1: Write the failing test**

```ts
// test/cli.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli.ts';

test('bare invocation is a run with no plugins', () => {
  const p = parseArgs([]);
  assert.equal(p.command, 'run');
  assert.deepEqual(p.names, []);
  assert.equal(p.profile, 'full');
});

test('names accumulate and --no-hooks selects the profile', () => {
  const p = parseArgs(['superpowers', 'warp', '--no-hooks']);
  assert.deepEqual(p.names, ['superpowers', 'warp']);
  assert.equal(p.profile, 'nohooks');
});

test('everything after -- is forwarded verbatim', () => {
  const p = parseArgs(['superpowers', '--', '--model', 'opus', '--no-hooks']);
  assert.deepEqual(p.names, ['superpowers']);
  assert.deepEqual(p.forward, ['--model', 'opus', '--no-hooks']);
  assert.equal(p.profile, 'full', '--no-hooks after -- belongs to claude, not us');
});

test('subcommands are recognised only in first position', () => {
  assert.equal(parseArgs(['list']).command, 'list');
  assert.equal(parseArgs(['clean']).command, 'clean');
  assert.equal(parseArgs(['fetch', 'superpowers']).command, 'fetch');
  assert.equal(parseArgs(['superpowers', 'list']).command, 'run');
  assert.deepEqual(parseArgs(['superpowers', 'list']).names, ['superpowers', 'list']);
});

test('an unknown flag before -- is rejected with a usable message', () => {
  assert.throws(() => parseArgs(['--bogus']), /--bogus/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/cli.test.ts`
Expected: FAIL — `Cannot find module '../src/cli.ts'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cli.ts
import { collectPluginIds, buildDisablePayload } from './settings.js';
import { resolvePlugin } from './resolve.js';
import { stagePlugin, type Profile } from './stage.js';
import { launch } from './launch.js';
import { listPlugins } from './commands/list.js';
import { cleanCache, prefetch } from './commands/cache.js';

export interface ParsedArgs {
  command: 'run' | 'list' | 'clean' | 'fetch';
  names: string[];
  profile: Profile;
  forward: string[];
}

const SUBCOMMANDS = new Set(['list', 'clean', 'fetch']);

export function parseArgs(argv: string[]): ParsedArgs {
  const sep = argv.indexOf('--');
  const own = sep === -1 ? argv : argv.slice(0, sep);
  const forward = sep === -1 ? [] : argv.slice(sep + 1);

  let command: ParsedArgs['command'] = 'run';
  let rest = own;
  if (own.length > 0 && SUBCOMMANDS.has(own[0])) {
    command = own[0] as ParsedArgs['command'];
    rest = own.slice(1);
  }

  const names: string[] = [];
  let profile: Profile = 'full';
  for (const arg of rest) {
    if (arg === '--no-hooks') profile = 'nohooks';
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}\nUsage: exciton [plugin...] [--no-hooks] [-- claude-args]`);
    else names.push(arg);
  }
  return { command, names, profile, forward };
}

export function run(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.command === 'list') return listPlugins(process.cwd());
  if (parsed.command === 'clean') return cleanCache();
  if (parsed.command === 'fetch') return prefetch(parsed.names);

  const { ids, managedIds } = collectPluginIds(process.cwd());
  if (managedIds.length > 0) {
    process.stderr.write(
      `exciton: ${managedIds.length} plugin(s) are fixed by enterprise-managed settings ` +
      `and cannot be disabled for a session: ${managedIds.join(', ')}\n`,
    );
  }

  const pluginDirs = parsed.names.map(name => stagePlugin(resolvePlugin(name), parsed.profile));

  const summary = parsed.names.length === 0 ? 'no plugins' : parsed.names.join(', ');
  process.stderr.write(
    `exciton: ${summary}${parsed.profile === 'nohooks' ? ' · no-hooks' : ''} · ${ids.length} global plugin(s) suppressed\n`,
  );

  return launch({ disablePayload: buildDisablePayload(ids), pluginDirs, forward: parsed.forward });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write(`exciton: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/cli.test.ts`
Expected: PASS — 5 tests. (Tasks 10 and 11 create `commands/list.ts` and `commands/cache.ts`; write those two files as one-line stubs returning `0` now so the import resolves, and replace them in the next tasks.)

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/commands/ test/cli.test.ts
git commit -m "feat: CLI parsing and run command"
```

---

### Task 10: `exciton list`

**Files:**
- Create: `src/commands/list.ts` (replacing the Task 9 stub)
- Test: `test/list.test.ts`

**Interfaces:**
- Consumes: `readInstalled` (`src/installed.ts`), `collectPluginIds` (`src/settings.ts`)
- Produces: `interface PluginRow { name: string; version: string; enabled: boolean; autoFires: boolean }`, `buildRows(cwd: string): PluginRow[]`, `formatRows(rows: PluginRow[]): string`, `listPlugins(cwd: string): number`

- [ ] **Step 1: Write the failing test**

```ts
// test/list.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRows } from '../src/commands/list.ts';

const ROWS = [
  { name: 'superpowers', version: '6.3.0', enabled: true, autoFires: true },
  { name: 'swift-lsp', version: '1.0.0', enabled: false, autoFires: false },
];

test('renders a header and one line per plugin', () => {
  const lines = formatRows(ROWS).trimEnd().split('\n');
  assert.match(lines[0], /NAME\s+VERSION\s+ENABLED\s+AUTO-FIRES/);
  assert.equal(lines.length, 3);
});

test('marks which plugins inject into every session', () => {
  const out = formatRows(ROWS);
  assert.match(out, /superpowers\s+6\.3\.0\s+yes\s+SessionStart/);
  assert.match(out, /swift-lsp\s+1\.0\.0\s+no\s+—/);
});

test('an empty list still renders the header', () => {
  assert.match(formatRows([]), /NAME/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/list.test.ts`
Expected: FAIL — `formatRows is not a function` (the Task 9 stub exports only `listPlugins`)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/commands/list.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readInstalled } from '../installed.js';
import { collectPluginIds } from '../settings.js';

export interface PluginRow {
  name: string;
  version: string;
  enabled: boolean;
  autoFires: boolean;
}

export function buildRows(cwd: string): PluginRow[] {
  const enabledIds = new Set(collectPluginIds(cwd).ids);
  return readInstalled()
    .map(p => ({
      name: p.name,
      version: p.version,
      enabled: enabledIds.has(p.id),
      autoFires: existsSync(join(p.installPath, 'hooks', 'hooks.json')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatRows(rows: PluginRow[]): string {
  const width = Math.max(4, ...rows.map(r => r.name.length));
  const header = `${'NAME'.padEnd(width)}  ${'VERSION'.padEnd(9)}  ${'ENABLED'.padEnd(7)}  AUTO-FIRES\n`;
  const body = rows
    .map(r =>
      `${r.name.padEnd(width)}  ${r.version.padEnd(9)}  ${(r.enabled ? 'yes' : 'no').padEnd(7)}  ` +
      `${r.autoFires ? 'SessionStart' : '—'}`)
    .join('\n');
  return rows.length === 0 ? header : `${header}${body}\n`;
}

export function listPlugins(cwd: string): number {
  process.stdout.write(formatRows(buildRows(cwd)));
  return 0;
}
```

Note: `autoFires` reports whether the plugin ships a `hooks/hooks.json` at all. Reading the file to name the specific events is a later refinement; `SessionStart` is the only event superpowers uses and the only one this column needs to warn about today.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/list.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/commands/list.ts test/list.test.ts
git commit -m "feat: exciton list shows which plugins auto-fire"
```

---

### Task 11: `exciton clean` and `exciton fetch`

**Files:**
- Create: `src/commands/cache.ts` (replacing the Task 9 stub)
- Test: `test/cache.test.ts`

**Interfaces:**
- Consumes: `EXCITON_DIR` (`src/paths.ts`), `resolvePlugin` (`src/resolve.ts`), `stagePlugin` (`src/stage.ts`)
- Produces: `cleanCache(root?: string): number`, `prefetch(names: string[]): number`

- [ ] **Step 1: Write the failing test**

```ts
// test/cache.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanCache } from '../src/commands/cache.ts';

function populatedCache(): string {
  const root = mkdtempSync(join(tmpdir(), 'xc-cache-'));
  mkdirSync(join(root, 'staged', 'sp-6.3.0-abc-nohooks'), { recursive: true });
  mkdirSync(join(root, 'src', 'sp', 'abc1234'), { recursive: true });
  writeFileSync(join(root, 'staged', 'sp-6.3.0-abc-nohooks', 'f'), 'x');
  return root;
}

test('removes both cache directories', () => {
  const root = populatedCache();
  assert.equal(cleanCache(root), 0);
  assert.equal(existsSync(join(root, 'staged')), false);
  assert.equal(existsSync(join(root, 'src')), false);
});

test('leaves the exciton root itself in place', () => {
  const root = populatedCache();
  cleanCache(root);
  assert.ok(existsSync(root));
});

test('cleaning an empty cache succeeds', () => {
  assert.equal(cleanCache(mkdtempSync(join(tmpdir(), 'xc-empty-'))), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-concurrency=2 test/cache.test.ts`
Expected: FAIL — the stub `cleanCache` takes no root and deletes nothing

- [ ] **Step 3: Write minimal implementation**

```ts
// src/commands/cache.ts
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { EXCITON_DIR } from '../paths.js';
import { resolvePlugin } from '../resolve.js';
import { stagePlugin } from '../stage.js';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-concurrency=2 test/cache.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/commands/cache.ts test/cache.test.ts
git commit -m "feat: exciton clean and exciton fetch"
```

---

### Task 12: Integration suite against real Claude Code

Guards the four documented behaviors the product rests on. Run against every new Claude Code release.

**Files:**
- Create: `test/integration/session.test.ts`
- Create: `test/integration/helpers.ts`
- Modify: `package.json` (the `test:integration` script already exists from Task 1)

**Interfaces:**
- Consumes: the built CLI plus a real `claude` binary
- Produces: `interface HookReport { registered: number; injected: number; skillsFrom: string }`, `runClaude(args: string[]): HookReport`

- [ ] **Step 1: Write the failing test**

```ts
// test/integration/helpers.ts
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
```

```ts
// test/integration/session.test.ts
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runClaude } from './helpers.ts';
import { collectPluginIds, buildDisablePayload } from '../../src/settings.ts';
import { resolvePlugin } from '../../src/resolve.ts';
import { stagePlugin } from '../../src/stage.ts';

const skip = { skip: !hasSuperpowers() };
function hasSuperpowers(): boolean {
  try { return !!resolvePlugin('superpowers'); } catch { return false; }
}

let payload: string;
before(() => { payload = buildDisablePayload(collectPluginIds(process.cwd()).ids); });

test('baseline: superpowers installed and enabled injects', skip, () => {
  assert.ok(runClaude([]).injected >= 1);
});

test('exciton superpowers --no-hooks: skills load, nothing fires', skip, () => {
  const dir = stagePlugin(resolvePlugin('superpowers'), 'nohooks');
  const r = runClaude(['--settings', payload, '--plugin-dir', dir]);
  assert.equal(r.registered, 0, 'no hooks may be registered');
  assert.equal(r.injected, 0, 'nothing may inject');
  assert.match(r.skillsFrom, /staged/, 'skills must come from the staged copy');
});

test('exciton superpowers: exactly one hook, one injection', skip, () => {
  const dir = stagePlugin(resolvePlugin('superpowers'), 'full');
  const r = runClaude(['--settings', payload, '--plugin-dir', dir]);
  assert.equal(r.registered, 1);
  assert.equal(r.injected, 1, 'must not double-inject');
});

test('bare exciton: zero plugins', () => {
  assert.equal(runClaude(['--settings', payload]).registered, 0);
});

test('integrity: no Claude state file is modified', skip, () => {
  const files = [
    `${process.env.HOME}/.claude/settings.json`,
    `${process.env.HOME}/.claude/plugins/installed_plugins.json`,
    `${process.env.HOME}/.claude/plugins/known_marketplaces.json`,
  ];
  const sum = () => files.map(f => execFileSync('shasum', [f]).toString());
  const before = sum();
  const dir = stagePlugin(resolvePlugin('superpowers'), 'nohooks');
  runClaude(['--settings', payload, '--plugin-dir', dir]);
  assert.deepEqual(sum(), before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL — `Cannot find module './helpers.ts'` until both files exist; once they do, all five must pass.

- [ ] **Step 3: Confirm the suite runs against the real binary**

No new implementation. Verify the environment instead:

```bash
claude --version          # expect 2.1.232 or later
node --version            # expect v24 or later
git --version
```

If `claude` is absent the suite cannot run; the unit tests in Tasks 1–11 remain the gate.

- [ ] **Step 4: Run the suite and confirm every documented behavior holds**

Run: `npm run test:integration`
Expected: PASS — 5 tests. Expected measurements, matching the verified design:

```
baseline           registered=9  injected=1
--no-hooks         registered=0  injected=0   skills from <staged>
full               registered=1  injected=1
bare               registered=0  injected=0
integrity          checksums unchanged
```

A failure here means Claude Code's documented behavior changed. Re-read the docs before changing any code.

- [ ] **Step 5: Commit**

```bash
git add test/integration/ package.json
git commit -m "test: integration suite guarding documented Claude Code behavior"
```

---

## Self-review notes

**Spec coverage.** Command surface → Tasks 9–11 (`exciton`, names, `--no-hooks`, `--`, `list`, `clean`, `fetch`). Mechanism §3 pipeline → Tasks 2 (parse/settings), 6 (resolve), 7 (stage), 8 (launch). Three-tier resolution → Tasks 3, 4, 5, 6. On-disk layout → Tasks 1, 7, 11. Extension seam → the `ResolveDeps` interface (Task 6) and the profile filter (Task 7). Testing rules → Task 12. Known limitations: managed-settings detection ships in Task 9; multi-scope enumeration is Task 2; `command`-source failure is Task 4.

**Deferred from v1, deliberately.** `exciton superpowers@6.2.0` resolves a ref but sets `version` to the raw ref rather than reading the fetched manifest — cosmetic, affects only the staging key. `exciton list` does not show marketplace plugins you have not installed. Neither blocks the v1 goal.

**Not covered by any task, and it should stay that way.** No `exciton install`. No writes under `~/.claude/`. No `claude plugin` invocations.
