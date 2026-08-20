import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSections, formatSections, type Sections } from '../src/commands/list.ts';
import type { InstalledPlugin } from '../src/installed.ts';

function row(name: string, over: Partial<Sections['frameworks'][number]> = {}) {
  return { name, version: '1.0.0', enabled: true, autoFires: false, installed: true, ...over };
}

const SECTIONS: Sections = {
  frameworks: [row('superpowers', { version: '6.3.0', autoFires: true, added: 'installed' })],
  others: [row('swift-lsp', { enabled: false })],
};

function installed(name: string, dir = `/x/${name}`): InstalledPlugin {
  return { id: `${name}@market`, name, installPath: dir, version: '1.0.0', sha: '' };
}

test('frameworks and ordinary plugins are reported under separate headings', () => {
  const out = formatSections(SECTIONS);
  assert.match(out, /FRAMEWORKS/);
  assert.match(out, /OTHER PLUGINS/);
  assert.ok(out.indexOf('superpowers') < out.indexOf('OTHER PLUGINS'));
  assert.ok(out.indexOf('swift-lsp') > out.indexOf('OTHER PLUGINS'));
});

test('each section keeps the columns that show what auto-fires', () => {
  const out = formatSections(SECTIONS);
  assert.match(out, /NAME\s+ADDED\s+VERSION\s+AUTO-FIRES/);
  assert.match(out, /superpowers\s+yes \(Claude's copy\)\s+6\.3\.0\s+SessionStart/);
  assert.match(out, /NAME\s+VERSION\s+ENABLED\s+AUTO-FIRES/);
  assert.match(out, /swift-lsp\s+1\.0\.0\s+no\s+—/);
});

/**
 * The whole reason for the framework section: `resolve.ts` tells a user who
 * mistyped a name to "check the name with `exciton list`". That is only honest
 * if the output names what exciton will actually accept.
 */
test('the framework section tells the reader what to type', () => {
  assert.match(formatSections(SECTIONS), /exciton superpowers/);
});

test('a framework that has not been added is shown as not added', () => {
  const out = formatSections({
    frameworks: [row('superpowers', { installed: false, version: '—', enabled: false })],
    others: [],
  });
  assert.match(out, /superpowers\s+no/);
  assert.match(out, /exciton add superpowers/);
});

/** With nothing added, `list` has to say why running will not work. */
test('a registry with nothing added says so plainly', () => {
  const out = formatSections({
    frameworks: [row('superpowers', { installed: false, version: '—' })],
    others: [],
  });
  assert.match(out, /nothing is added yet/i);
  assert.doesNotMatch(out, /Run: exciton/);
});

test('an added framework offers the run line, not the warning', () => {
  const out = formatSections(SECTIONS);
  assert.match(out, /Run: exciton superpowers/);
  assert.doesNotMatch(out, /nothing is added yet/i);
});

test('the source of an added framework is visible', () => {
  const own = formatSections({ frameworks: [row('superpowers', { added: 'own' })], others: [] });
  assert.match(own, /exciton's copy/);
});

test('the other-plugins section is omitted entirely when there are none', () => {
  const out = formatSections({ frameworks: SECTIONS.frameworks, others: [] });
  assert.doesNotMatch(out, /OTHER PLUGINS/);
});

test('an empty framework section still renders its heading', () => {
  assert.match(formatSections({ frameworks: [], others: [] }), /FRAMEWORKS/);
});

test('buildSections sorts a managed framework away from ordinary plugins', () => {
  const s = buildSections('/cwd', {
    read: () => [installed('swift-lsp'), installed('superpowers'), installed('warp')],
    enabledIds: () => new Set(['superpowers@market']),
    addedSource: () => undefined,
  });
  assert.deepEqual(s.frameworks.map(r => r.name), ['superpowers']);
  assert.deepEqual(s.others.map(r => r.name), ['swift-lsp', 'warp']);
});

test('buildSections reflects whether a plugin is enabled in any scope', () => {
  const s = buildSections('/cwd', {
    read: () => [installed('superpowers'), installed('warp')],
    enabledIds: () => new Set(['superpowers@market']),
    addedSource: () => undefined,
  });
  assert.equal(s.frameworks[0].enabled, true);
  assert.equal(s.others[0].enabled, false);
});

/** A framework exciton supports but you have never installed is still runnable. */
test('buildSections includes a supported framework missing from disk', () => {
  const s = buildSections('/cwd', {
    read: () => [], enabledIds: () => new Set(), addedSource: () => undefined,
  });
  assert.deepEqual(s.frameworks.map(r => r.name), ['superpowers']);
  assert.equal(s.frameworks[0].installed, false);
});

test('buildSections reports where an added framework runs from', () => {
  const s = buildSections('/cwd', {
    read: () => [installed('superpowers')],
    enabledIds: () => new Set(),
    addedSource: n => n === 'superpowers' ? 'own' : undefined,
  });
  assert.equal(s.frameworks[0].added, 'own');
});
