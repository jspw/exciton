import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseArgs, isMainModule, assertManaged, assertSingleFramework, run, helpText, versionText,
} from '../src/cli.ts';
import type { Resolved } from '../src/resolve.ts';

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
  assert.equal(parseArgs(['fetch', 'superpowers']).command, 'fetch');
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

test('naming nothing is accepted — bare exciton is a pass-through', () => {
  assert.doesNotThrow(() => assertManaged([]));
});

/** exciton dials agentic frameworks. Ordinary plugins are none of its business. */
test('an unmanaged plugin is refused, naming it and what exciton does manage', () => {
  assert.throws(() => assertManaged([resolved('warp')]), /warp/);
  assert.throws(() => assertManaged([resolved('warp')]), /superpowers/);
});

/**
 * The refusal reaches the shell as a failure, not just as prose on stderr.
 * assertManaged throwing is only half the promise — a script that runs
 * `exciton warp` has to be able to detect it, so spawn the real CLI and
 * check the status the top-level handler actually exits with.
 */
test('refusing an unmanaged plugin exits non-zero', () => {
  const cli = new URL('../src/cli.ts', import.meta.url).pathname;
  const proc = spawnSync(process.execPath, [cli, 'warp'], { encoding: 'utf8' });
  assert.equal(proc.status, 1);
  assert.match(proc.stderr, /does not manage warp/);
});

test('the refusal lists every unmanaged name at once', () => {
  assert.throws(
    () => assertManaged([resolved('superpowers'), resolved('warp'), resolved('swift-lsp')]),
    /warp.*swift-lsp|swift-lsp.*warp/s,
  );
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
