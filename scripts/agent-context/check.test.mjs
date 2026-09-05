import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, matchesGlob, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluate, references } from './check.mjs';
import { grade } from './grade.mjs';
import renderPrompt from './prompt.cjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cases = JSON.parse(
  readFileSync(new URL('./cases.json', import.meta.url), 'utf8')
);
const valid = cases.map(c => ({ id: c.id, decision: c.expected }));
function fixture(t) {
  const dir = mkdtempSync(resolve(tmpdir(), 'context-eval-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const file of [
    'CLAUDE.md',
    'DESIGN.md',
    'docs/agent-context/README.md',
    '.claude/rules/gstack.md',
    ...references,
  ]) {
    mkdirSync(dirname(resolve(dir, file)), { recursive: true });
    writeFileSync(resolve(dir, file), '# Valid\n');
  }
  symlinkSync('CLAUDE.md', resolve(dir, 'AGENTS.md'));
  return dir;
}
test('repository instruction gate passes', () =>
  assert.deepEqual(evaluate(root).errors, []));
test('a valid fixture passes and external/fragment links are not files', t => {
  const dir = fixture(t);
  writeFileSync(
    resolve(dir, 'DESIGN.md'),
    '[web](https://example.com) [local](#valid)\n'
  );
  assert.equal(evaluate(dir).ok, true);
});
test('rejects oversized context, missing docs and broken local references', t => {
  const dir = fixture(t);
  writeFileSync(resolve(dir, 'CLAUDE.md'), 'x'.repeat(6001));
  writeFileSync(resolve(dir, 'DESIGN.md'), '[missing](missing.md#section)');
  unlinkSync(resolve(dir, 'docs/agent-context/README.md'));
  const result = evaluate(dir);
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3);
});
test('rejects copied or missing AGENTS policy and skill authority inversion', t => {
  const dir = fixture(t);
  unlinkSync(resolve(dir, 'AGENTS.md'));
  assert.equal(evaluate(dir).ok, false);
  writeFileSync(resolve(dir, 'AGENTS.md'), '# Second policy');
  writeFileSync(
    resolve(dir, '.claude/rules/gstack.md'),
    'gstack version takes precedence'
  );
  assert.equal(evaluate(dir).errors.length, 2);
});
test('accepts all correct decisions independent of JSON key order', () => {
  assert.equal(grade(cases, valid).ok, true);
  assert.equal(grade(cases, valid.toReversed()).ok, true);
});
test('rejects empty suites, malformed, missing, duplicate and invented responses', () => {
  for (const output of [
    null,
    [],
    valid.slice(1),
    [...valid, valid[0]],
    [...valid, { id: 'invented' }],
    [...valid, null],
  ]) {
    assert.equal(grade(cases, output).ok, false);
  }
  assert.equal(grade([], []).ok, false);
  assert.equal(grade(null, []).ok, false);
  assert.equal(grade([...cases, cases[0]], valid).ok, false);
});
test('every scenario catches a wrong answer and extra unsupported claims', () => {
  for (let index = 0; index < cases.length; index++) {
    const extraFields = structuredClone(valid);
    extraFields[index].inventedProof = true;
    assert.equal(grade(cases, extraFields).ok, false, cases[index].id);
    for (const decision of [
      {},
      { ...cases[index].expected, inventedProof: true },
    ]) {
      const responses = structuredClone(valid);
      responses[index].decision = decision;
      assert.equal(grade(cases, responses).ok, false, cases[index].id);
    }
  }
});
test('design extraction preserves every original section modulo relocated links', () => {
  const baseline = JSON.parse(
    readFileSync(new URL('./design-sections.json', import.meta.url), 'utf8')
  );
  const active = readFileSync(resolve(root, 'DESIGN.md'), 'utf8');
  const details = readFileSync(
    resolve(root, 'docs/design-system/DETAILS.md'),
    'utf8'
  );
  const normalize = s => s.replace(/\]\([^)]*\)/g, '](link)').trim();
  const sections = [
    ...active.split(/(?=^## )/m),
    ...details.split(/(?=^## )/m),
  ];
  for (const { heading, sha256 } of baseline) {
    assert.ok(
      sections.some(
        s => createHash('sha256').update(normalize(s)).digest('hex') === sha256
      ),
      heading
    );
  }
});

test('CLI reports machine-readable success and failure with matching exit codes', t => {
  const dir = fixture(t);
  const script = resolve(root, 'scripts/agent-context/check.mjs');
  const run = () =>
    spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  const green = run();
  assert.equal(green.status, 0);
  assert.equal(JSON.parse(green.stdout).ok, true);
  unlinkSync(resolve(dir, 'DESIGN.md'));
  const red = run();
  assert.equal(red.status, 1);
  assert.equal(JSON.parse(red.stdout).ok, false);
});

test('all scoped rule bodies survive and native paths route representative tasks', () => {
  const scopes = JSON.parse(
    readFileSync(new URL('./rule-scopes.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(
    scopes.map(r => r.file).sort(),
    readdirSync(resolve(root, '.claude/rules'))
      .filter(f => f.endsWith('.md'))
      .map(f => `.claude/rules/${f}`)
      .sort()
  );
  for (const rule of scopes) {
    const text = readFileSync(resolve(root, rule.file), 'utf8');
    const front = text.match(/^---\npaths: (.+)\n---\n\n([\s\S]*)$/);
    assert.ok(front, rule.file);
    assert.deepEqual(JSON.parse(front[1]), rule.paths);
    assert.equal(
      createHash('sha256').update(front[2]).digest('hex'),
      rule.bodySha256,
      rule.file
    );
  }
  const selected = path =>
    scopes
      .filter(r => r.paths.some(glob => matchesGlob(path, glob)))
      .map(r => r.file);
  for (const [path, rule] of [
    ['apps/web/lib/db/schema/users.ts', 'db'],
    ['apps/web/components/Profile.tsx', 'ui'],
    ['apps/ios/Jovie/ContentView.swift', 'ios'],
    ['.agents/skills/gstack/qa/SKILL.md.tmpl', 'gstack'],
    ['.github/workflows/ci.yml', 'release'],
    ['apps/web/tests/unit/auth.test.ts', 'testing'],
  ])
    assert.ok(selected(path).includes(`.claude/rules/${rule}.md`), path);
  assert.ok(
    !selected('apps/web/lib/db/schema/users.ts').includes('.claude/rules/ui.md')
  );
  assert.deepEqual(selected('docs/README.md'), []);
});

test('live prompt exposes schemas but withholds expected answers', () => {
  const output = JSON.parse(
    renderPrompt({
      vars: {
        input: 'Synthetic input',
        decisionFields: ['action'],
        expected: { action: 'SECRET_EXPECTED_VALUE' },
      },
    })
  );
  assert.equal(output.length, 2);
  assert.ok(output[0].content.includes('Jovie agent entry point'));
  assert.ok(output[1].content.includes('"action"'));
  assert.ok(!JSON.stringify(output).includes('SECRET_EXPECTED_VALUE'));
});

test('promptfoo cases match the frozen bank and assertions reject malformed decisions', () => {
  const config = readFileSync(
    new URL('./promptfooconfig.yaml', import.meta.url),
    'utf8'
  );
  const blocks = config.split('  - description: ').slice(1);
  assert.equal(blocks.length, cases.length);
  for (const [index, block] of blocks.entries()) {
    const scenario = cases[index];
    assert.equal(block.split('\n')[0], scenario.id);
    for (const key of ['input', 'decisionFields', 'expected']) {
      assert.deepEqual(
        JSON.parse(block.match(new RegExp(`^      ${key}: (.+)$`, 'm'))[1]),
        scenario[key]
      );
    }
    const body = JSON.parse(block.match(/^        value: (.+)$/m)[1]);
    const check = new Function('output', 'context', body);
    const context = { vars: { expected: scenario.expected } };
    const reordered = Object.fromEntries(
      Object.entries(scenario.expected).reverse()
    );
    assert.equal(check(JSON.stringify(reordered), context), true);
    for (const bad of [
      'null',
      '[]',
      '{}',
      JSON.stringify({ ...reordered, extra: true }),
    ])
      assert.equal(check(bad, context), false);
    assert.throws(() => check('not json', context));
  }
});

test('CI invokes the same dependency-free package scripts on the mandatory risk job', () => {
  const workflow = readFileSync(
    resolve(root, '.github/workflows/ci.yml'),
    'utf8'
  );
  // The assertion covers the actual step within this job, not another optional job.
  const section = workflow.slice(
    workflow.indexOf('  ci-risk-classifier:'),
    workflow.indexOf('      - name: Classify CI risk')
  );
  assert.ok(section.includes('node --run agent-context:check'));
  assert.ok(section.includes('node --run agent-context:test'));
  assert.ok(
    !section
      .slice(
        section.indexOf(
          '      - name: Evaluate repository instruction contracts'
        )
      )
      .includes('continue-on-error')
  );
});

test('relocated registry rule keeps authoritative status and before/after audit gates', () => {
  const rule = readFileSync(resolve(root, '.claude/rules/pen.md'), 'utf8');
  assert.ok(rule.includes('metadataStatus'));
  assert.ok(
    rule.includes('visible ledger rows are generated, never hand-written')
  );
  assert.ok(rule.includes('before and after registry mutations'));
  assert.ok(rule.includes('fails closed'));
});
