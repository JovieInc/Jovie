import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CodegenError,
  convert,
  emit,
  loadTokenColors,
  parseHtml,
  parseStyle,
  resolveColor,
} from './design-pen-codegen.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'pen-codegen');
const base = JSON.parse(
  readFileSync(join(HERE, 'design-pen-codegen.rules.json'), 'utf8')
);
const extra = JSON.parse(readFileSync(join(FX, 'hero.rules.json'), 'utf8'));
const tokens = loadTokenColors();
const html = readFileSync(join(FX, 'hero-export.html'), 'utf8');
const merge = (r, e) => ({
  ...r,
  colorOverrides: { ...r.colorOverrides, ...e.colorOverrides },
  typeOverrides: { ...r.typeOverrides, ...e.typeOverrides },
  links: { ...r.links, ...e.links },
});

function generate(rules, src = html) {
  const ir = convert(parseHtml(src), { section: 'hero', rules, tokens });
  if (ir.problems.length) throw new CodegenError(ir.problems);
  return {
    ir,
    tsx: emit(ir, {
      source: 'fixture#EDH071',
      sourceHash: 'f'.repeat(64),
      publicBase: '/pen/hero',
    }),
  };
}

test('golden: hero fixture generates the committed component', () => {
  const { tsx } = generate(merge(base, extra));
  const goldenPath = join(FX, 'PenHero.golden.txt');
  if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath, tsx);
  assert.equal(tsx, readFileSync(goldenPath, 'utf8'));
});

test('output carries the section marker and no raw colors or arbitrary values', () => {
  const { tsx } = generate(merge(base, extra));
  assert.match(tsx, /data-pen-section='hero'/);
  assert.doesNotMatch(tsx, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(tsx, /(?:^|[\s'"])[a-z-]+-\[[^\]]+\]/);
  assert.doesNotMatch(tsx, /style=/);
  assert.match(tsx, /<Image/);
});

test('an unmapped raw color fails and is not emitted', () => {
  assert.throws(
    () => generate(base),
    err => {
      assert.ok(err instanceof CodegenError);
      assert.ok(
        err.problems.some(p => p.kind === 'color' && /#c3c7cf/.test(p.message))
      );
      return true;
    }
  );
});

test('token mapping: exact hex resolves, near miss does not', () => {
  const problems = [];
  const ctx = { problems, snaps: [], rules: base, tokens, where: 't' };
  assert.equal(
    resolveColor('#F5F7FB', 'text', ctx).utility,
    'text-primary-token'
  );
  assert.equal(resolveColor('#07080A', 'bg', ctx).utility, 'bg-surface-0');
  assert.equal(resolveColor('#f5f7fc', 'text', ctx), null);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /nearest is text\.primary/);
  assert.equal(resolveColor('#00000000', 'bg', ctx), null);
  assert.equal(problems.length, 1);
});

test('a token without a utility for the role fails', () => {
  const problems = [];
  resolveColor('#11afff', 'bg', {
    problems,
    snaps: [],
    rules: base,
    tokens,
    where: 't',
  });
  assert.match(problems[0].message, /no bg utility/);
});

test('off-scale type fails, a missing link fails', () => {
  const noType = merge(base, { ...extra, typeOverrides: {} });
  assert.throws(
    () => generate(noType),
    err => err.problems.some(p => p.kind === 'type' && /22px/.test(p.message))
  );
  const noLink = merge(base, { ...extra, links: {} });
  assert.throws(
    () => generate(noLink),
    err => err.problems.some(p => p.kind === 'component')
  );
});

test('nested layout without a rule is reported as unresolved, not guessed', () => {
  const src = html
    .replace('Conversation expectation"', 'Conversation expectation"')
    .replace(
      'Start with a conversation.',
      '<div style="color: #f5f7fb">x</div>'
    );
  assert.throws(
    () => generate(merge(base, extra), src),
    err => err.problems.some(p => p.kind === 'unresolved')
  );
});

test('layout lands on the Pen y positions and the grid warns about off-grid x', () => {
  const { ir } = generate(merge(base, extra));
  assert.equal(ir.pt, 232);
  assert.deepEqual(
    ir.items.map(i => i.col),
    [1, 1, 1, 1]
  );
  assert.ok(ir.warnings.some(w => /x=100 is 4px off/.test(w)));
  assert.deepEqual(
    ir.skipped.map(s => s.id),
    ['EDHNAV']
  );
});

test('parseStyle keeps url() with semicolons-free values and splits properly', () => {
  assert.deepEqual(parseStyle("a: url('x.png'); b: 1px"), {
    a: "url('x.png')",
    b: '1px',
  });
});
