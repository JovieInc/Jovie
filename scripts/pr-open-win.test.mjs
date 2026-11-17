import assert from 'node:assert/strict';
import test from 'node:test';
import { draftBody, evidenceFromBody, gate, main } from './pr-open.mjs';

const file = (filename, status = 'modified') => ({
  filename,
  status,
  patch: '',
});
const metric = 'egress|MB|lower|26|pg_stat_statements|select 1';
const ok = value => ({ status: 0, stdout: JSON.stringify(value), stderr: '' });
const targetPr = (number, overrides) => ({
  number,
  labels: [],
  headRefName: 'test-branch',
  headRefOid: 'a'.repeat(40),
  baseRefOid: 'b'.repeat(40),
  url: `https://github.com/JovieInc/Jovie/pull/${number}`,
  changedFiles: 1,
  ...overrides,
});

test('regenerating measured Win evidence retains the after-value and verification URL', () => {
  const title = 'perf(ci): reduce environment setup';
  const files = [file('scripts/x.mjs'), file('scripts/x.test.mjs', 'added')];
  for (const after of ['0', '0.74']) {
    const original = [
      '## Win',
      '- Claim: Environment setup is cheaper',
      '- Area: ci',
      '- Theme: merge-throughput',
      `- Metric: setup | s | lower | 2.8 | ${after} | Vitest duration | pnpm test`,
      '- Verify: https://github.com/JovieInc/Jovie/actions/runs/123',
      '- Per-merge: yes',
    ].join('\n');
    const body = draftBody({
      ...evidenceFromBody(original),
      title,
      files,
      prUrl: 'https://github.com/JovieInc/Jovie/pull/42',
    });
    assert.match(
      body,
      new RegExp(`\\| 2\\.8 \\| ${after.replace('.', '\\.')} \\|`)
    );
    assert.match(
      body,
      /Verify: https:\/\/github.com\/JovieInc\/Jovie\/actions\/runs\/123/
    );
    assert.doesNotMatch(body, /Pending: yes/);
    assert.deepEqual(gate({ title, body, files }).errors, []);
  }
});

test('unknown after-values stay pending instead of becoming measured results', () => {
  for (const after of ['?', '', 'NaN', 'Infinity']) {
    const evidence = evidenceFromBody(
      `## Win\n- Metric: setup | s | lower | 2.8 | ${after} | Vitest | pnpm test`
    );
    assert.equal(evidence.metricAfter, undefined);
    const body = draftBody({
      ...evidence,
      title: 'perf(ci): setup',
      files: [],
    });
    assert.match(body, /\| 2\.8 \| \? \|/);
    assert.match(body, /Pending: yes/);
  }
});

test('CLI metric overrides require their own after-value and verification URL', async () => {
  const title = 'perf(ci): setup';
  const pr = targetPr(42, {
    title,
    body: draftBody({
      title,
      files: [],
      metric,
      metricAfter: '3',
      verifyLink: 'https://github.com/JovieInc/Jovie/actions/runs/123',
    }),
  });
  for (const measured of [false, true]) {
    const output = [];
    const code = await main(
      [
        'draft',
        '42',
        '--metric',
        'setup|s|lower|2.8|Vitest|pnpm test',
        ...(measured
          ? [
              '--metric-after',
              '0',
              '--verify-link',
              'https://github.com/JovieInc/Jovie/actions/runs/456',
            ]
          : []),
      ],
      body => output.push(body),
      {
        github: (_cwd, args) =>
          args[0] === 'pr'
            ? ok(pr)
            : ok([[file('scripts/x.test.mjs', 'added')]]),
        execute: () => {
          throw new Error('draft must not invoke a diff or push');
        },
        diagnose: () => {},
      }
    );
    assert.equal(code, 0);
    const body = output.join('\n');
    assert.doesNotMatch(body, /runs\/123|\| 3 \|/);
    if (measured) {
      assert.match(body, /\| 2\.8 \| 0 \|/);
      assert.match(body, /runs\/456/);
      assert.doesNotMatch(body, /Pending: yes/);
    } else {
      assert.match(body, /\| 2\.8 \| \? \|/);
      assert.match(body, /Pending: yes/);
    }
    assert.deepEqual(gate({ title, body, files: [] }).errors, []);
  }
});
