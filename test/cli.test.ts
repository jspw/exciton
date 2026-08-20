import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseArgs, isMainModule, assertManaged, assertSingleFramework, assertNotEnterpriseLocked,
  assertAdded, runLine, run, helpText, versionText,
} from '../src/cli.ts';
import type { Resolved } from '../src/resolve.ts';
import { UserError } from '../src/ui.ts';
/** What the user actually sees: a UserError's headline plus its detail lines. */
function shown(fn: () => unknown): string {
  try { fn(); } catch (e) {
    return e instanceof UserError ? e.render() : String((e as Error).message);
  }
  throw new Error('expected a throw, got none');
}


function resolved(name: string): Resolved {
  return { name, dir: `/x/${name}`, version: '1.0.0', sha: '', origin: 'installed' };
}

/**
 * A framework name is mandatory. Without one exciton would launch a session
 * indistinguishable from plain `claude`, so there would be no reason to type
 * `exciton` at all — it is a usage error, not a mode.
 */
test('bare invocation is refused with usage, not run as a pass-through', () => {
  assert.equal(run([]), 1);
});

test('naming a framework parses as a run', () => {
  const p = parseArgs(['superpowers']);
  assert.equal(p.command, 'run');
  assert.deepEqual(p.names, ['superpowers']);
  assert.equal(p.profile, 'full');
});

test('help is available by flag, short flag, and subcommand', () => {
  for (const argv of [['--help'], ['-h'], ['help']]) {
    assert.equal(parseArgs(argv).command, 'help', `${argv[0]} should ask for help`);
  }
  assert.equal(run(['--help']), 0);
});

test('help names the framework it manages and both profiles', () => {
  const text = helpText();
  assert.match(text, /superpowers/);
  assert.match(text, /--no-hooks/);
  assert.match(text, /exciton <framework>/);
});

test('help promises ordinary plugins are left alone', () => {
  assert.match(helpText(), /ordinary plugins/i);
  assert.match(helpText(), /keep working exactly\s+as your own settings/i);
});

test('help states that frameworks are mutually exclusive', () => {
  assert.match(helpText(), /mutually exclusive/i);
});

test('version is available by flag and subcommand, and is the package version', () => {
  for (const argv of [['--version'], ['-v'], ['version']]) {
    assert.equal(parseArgs(argv).command, 'version', `${argv[0]} should ask for version`);
  }
  assert.match(versionText(), /^\d+\.\d+\.\d+$/);
  assert.equal(run(['--version']), 0);
});

test('a flag after -- belongs to claude, not to exciton', () => {
  const p = parseArgs(['superpowers', '--', '--help']);
  assert.equal(p.command, 'run');
  assert.deepEqual(p.forward, ['--help']);
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
  assert.equal(parseArgs(['add', 'superpowers']).command, 'add');
  assert.equal(parseArgs(['remove', 'superpowers']).command, 'remove');
  assert.equal(parseArgs(['update']).command, 'update');
  assert.equal(parseArgs(['superpowers', 'list']).command, 'run');
  assert.deepEqual(parseArgs(['superpowers', 'list']).names, ['superpowers', 'list']);
});

test('an unknown flag before -- is rejected with a usable message', () => {
  assert.throws(() => parseArgs(['--bogus']), /--bogus/);
});

test('a managed framework is accepted', () => {
  assert.doesNotThrow(() => assertManaged([resolved('superpowers')]));
});

/**
 * Frameworks are mutually exclusive by nature: each wants to define how the
 * session is conducted. Running two at once is the mixture exciton exists to
 * prevent, so it is refused rather than staged.
 */
test('naming two frameworks is refused — they compete to govern the session', () => {
  // Simulates the world where spec-kit has been added to FRAMEWORKS.
  const managed = (n: string) => n === 'superpowers' || n === 'spec-kit';
  const pair = [resolved('superpowers'), resolved('spec-kit')];
  assert.throws(() => assertSingleFramework(pair, managed), /superpowers.*spec-kit/s);
  assert.throws(() => assertSingleFramework(pair, managed), /mutually exclusive/i);
});

/** `exciton superpowers ./my-superpowers-fork` — same framework twice, not a conflict of kind. */
test('naming the same framework twice gets its own message, not the exclusivity one', () => {
  const twice = [resolved('superpowers'), resolved('superpowers')];
  assert.throws(() => assertSingleFramework(twice), /more than once/i);
  assert.doesNotMatch(
    String(assert.throws(() => assertSingleFramework(twice))),
    /mutually exclusive/i,
  );
});

test('naming one framework is fine', () => {
  assert.doesNotThrow(() => assertSingleFramework([resolved('superpowers')]));
});

/** The refusal is `run`'s job (see above); assertManaged has nothing to judge. */
test('assertManaged has no opinion on an empty selection', () => {
  assert.doesNotThrow(() => assertManaged([]));
});

/** exciton dials agentic frameworks. Ordinary plugins are none of its business. */
test('an unmanaged plugin is refused, naming it and what exciton does manage', () => {
  const text = shown(() => assertManaged([resolved('warp')]));
  assert.match(text, /warp/);
  assert.match(text, /superpowers/);
});

/**
 * The refusal reaches the shell as a failure, not just as prose on stderr.
 * assertManaged throwing is only half the promise — a script that runs
 * `exciton warp` has to be able to detect it, so spawn the real CLI and
 * check the status the top-level handler actually exits with.
 */
test('refusing an unmanaged plugin exits non-zero', () => {
  // Resolve through a directory rather than the bare name `warp`: a bare name
  // only resolves where that plugin is installed, so asserting on it would pass
  // on the author's machine and fail on any CI runner, for the wrong reason.
  const dir = mkdtempSync(join(tmpdir(), 'xc-warp-'));
  mkdirSync(join(dir, '.claude-plugin'));
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'warp', version: '2.1.0' }),
  );
  const cli = new URL('../src/cli.ts', import.meta.url).pathname;
  const proc = spawnSync(process.execPath, [cli, dir], { encoding: 'utf8' });
  assert.equal(proc.status, 1);
  assert.match(proc.stderr, /doesn't manage warp/);
});

test('the refusal lists every unmanaged name at once', () => {
  assert.throws(
    () => assertManaged([resolved('superpowers'), resolved('warp'), resolved('swift-lsp')]),
    /warp.*swift-lsp|swift-lsp.*warp/s,
  );
});

/**
 * Managed settings outrank --settings, so a force-enabled framework survives
 * the suppression payload while --plugin-dir still adds the staged copy. That
 * session is the exact mixture exciton exists to prevent, so launching it —
 * even after a warning — is worse than not running at all. Refuse instead.
 */
test('a framework pinned by enterprise settings is refused, not warned about', () => {
  assert.throws(
    () => assertNotEnterpriseLocked(['superpowers@official'], ['superpowers@official']),
    /superpowers@official/,
  );
});

test('the enterprise refusal explains why the session cannot be delivered', () => {
  assert.match(
    shown(() => assertNotEnterpriseLocked(['superpowers@official'], ['superpowers@official'])),
    /enterprise-managed/,
  );
});

test('an enterprise-managed plugin exciton is not suppressing is no obstacle', () => {
  assert.doesNotThrow(() => assertNotEnterpriseLocked(['superpowers@official'], ['warp@official']));
});

test('nothing enterprise-managed at all is the ordinary case', () => {
  assert.doesNotThrow(() => assertNotEnterpriseLocked(['superpowers@official'], []));
});

/**
 * A local checkout is judged by its manifest name, not the directory it sits
 * in, so `exciton ./my-superpowers-fork` is still recognised as the framework.
 */
test('a path-resolved plugin is judged by its manifest name', () => {
  assert.doesNotThrow(() => assertManaged([
    { name: 'superpowers', dir: '/tmp/fork', version: '0.0.0', sha: '', origin: 'path' },
  ]));
});

/**
 * npm installs bins as symlinks, so argv[1] is the symlink while import.meta.url
 * is the realpath. A naive equality check leaves `exciton` silently doing nothing.
 */
test('the main-module guard fires through an npm-style bin symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xc-bin-'));
  const real = join(dir, 'cli.js');
  const link = join(dir, 'exciton');
  writeFileSync(real, '');
  symlinkSync(real, link);
  // import.meta.url is always the fully-resolved realpath, and on macOS
  // tmpdir() sits under /var -> /private/var. Resolve to match reality.
  const metaUrl = pathToFileURL(realpathSync(real)).href;
  assert.equal(isMainModule(metaUrl, link), true, 'invoked via symlink');
  assert.equal(isMainModule(metaUrl, real), true, 'invoked directly');
});

test('the main-module guard stays quiet when imported as a library', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xc-bin-'));
  const real = join(dir, 'cli.js');
  const other = join(dir, 'test-runner.js');
  writeFileSync(real, '');
  writeFileSync(other, '');
  const metaUrl = pathToFileURL(realpathSync(real)).href;
  assert.equal(isMainModule(metaUrl, other), false);
  assert.equal(isMainModule(metaUrl, undefined), false);
  assert.equal(isMainModule(metaUrl, '/nonexistent/path'), false);
});

test('the built bin carries a shebang so POSIX can exec it', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const built = new URL('../dist/cli.js', import.meta.url).pathname;
  if (!existsSync(built)) return; // dist/ is a build artifact; skip before `npm run build`
  assert.match(readFileSync(built, 'utf8').split('\n')[0], /^#!\/usr\/bin\/env node$/);
});

/**
 * The gate the whole registry exists to serve: a framework you have not added
 * does not silently run. The refusal has to name the command that fixes it.
 */
test('running a framework that is not added is refused with the fix', () => {
  assert.match(shown(() => assertAdded('superpowers', [])), /exciton add superpowers/);
});

test('running a framework that is added is allowed', () => {
  assert.doesNotThrow(() => assertAdded('superpowers', ['superpowers']));
});

test('the refusal explains that this is not a global install', () => {
  const text = shown(() => assertAdded('superpowers', []));
  assert.match(text, /global install/i);
  assert.match(text, /session/i);
});

test('the source flags select which copy add uses', () => {
  assert.equal(parseArgs(['add', 'superpowers', '--use-installed']).source, 'installed');
  assert.equal(parseArgs(['add', 'superpowers', '--own']).source, 'own');
  assert.equal(parseArgs(['add', 'superpowers']).source, undefined);
});

/**
 * The only confirmation that the launched session is the one that was asked
 * for. Silence on the default profile made a full session and a broken one
 * look identical, so both directions are stated.
 */
test('the launch line names the framework and the profile it got', () => {
  assert.match(runLine('superpowers', 'nohooks'), /superpowers/);
  assert.match(runLine('superpowers', 'nohooks'), /no-hooks/);
  assert.match(runLine('superpowers', 'full'), /hooks active/);
});

test('the launch line says what no-hooks actually does', () => {
  assert.match(runLine('superpowers', 'nohooks'), /nothing auto-fires/);
});

test('the launch line is one line, indented like every other message', () => {
  const line = runLine('superpowers', 'full');
  assert.doesNotMatch(line, /\n/);
  assert.match(line, /^ {2}\S/);
});

/** Help states the setup step; without it the gate looks like a malfunction. */
test('help says a framework must be added before it runs', () => {
  assert.match(helpText(), /must be added before it will run/i);
});

test('help lists every command the CLI actually accepts', () => {
  const text = helpText();
  for (const cmd of ['add', 'remove', 'update', 'list', 'clean', 'help', 'version']) {
    assert.match(text, new RegExp(`\\n\\s+${cmd}\\b`), `${cmd} missing from help`);
  }
});

test('help no longer advertises the removed fetch command', () => {
  assert.doesNotMatch(helpText(), /\bfetch\b/);
});

/**
 * Help goes to stdout, messages to stderr. `exciton help > file` must not land
 * escape codes in the file just because stderr happens to be a terminal.
 */
test('help colour follows stdout, not stderr', () => {
  const original = process.stdout.isTTY;
  try {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    assert.doesNotMatch(helpText(), /\x1b\[/);
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true });
  }
});
