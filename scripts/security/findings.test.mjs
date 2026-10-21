import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { load as parseYaml } from 'js-yaml';
import {
  computeKey,
  familyOf,
  InvalidFindingError,
  mergeFindings,
  sameFinding,
} from './findings/fingerprint.mjs';
import { parseDocument } from './findings/normalize.mjs';
import { bucket, pageWorthy } from './findings/policy.mjs';
import {
  blockingIssues,
  formatGateReport,
  gateDecision,
  parseIssueFooter,
  runSecurityGate,
} from './security-gate.mjs';

const base = {
  repo: 'JovieInc/Jovie',
  file: 'apps/web/app/api/users/route.ts',
  cwe: [89],
  rule_id: 'js/sql-injection',
  symbol: 'GET',
};

/**
 * @param {{
 *   driver?: string,
 *   level?: string,
 *   score?: string | null,
 *   uri?: string,
 * }} [input]
 */
function sarifDocument({ driver = 'CodeQL', level, score, uri } = {}) {
  return {
    runs: [
      {
        tool: {
          driver: {
            name: driver,
            rules: [
              {
                id: base.rule_id,
                properties: { 'security-severity': score },
              },
            ],
          },
        },
        results: [
          {
            ruleId: base.rule_id,
            level,
            locations: [{ physicalLocation: { artifactLocation: { uri } } }],
          },
        ],
      },
    ],
  };
}

test('SARIF security scores take precedence over diagnostic levels', () => {
  for (const [level, score, expected] of [
    ['warning', '9.8', 'critical'],
    ['note', '8.2', 'high'],
    ['error', '5.0', 'medium'],
    ['warning', '2.0', 'low'],
    ['warning', '0', 'info'],
    ['warning', undefined, 'medium'],
    ['error', null, 'high'],
    ['warning', '', 'medium'],
    ['error', 'invalid', 'high'],
    ['error', '11', 'high'],
    ['warning', '-1', 'medium'],
  ]) {
    const result = parseDocument(sarifDocument({ level, score }));
    assert.equal(result.findings[0].severity, expected, `${level}/${score}`);
  }
});

test('CSV and JSON severity names ignore surrounding whitespace and case', () => {
  const csv = parseDocument(
    'id,severity,rule,file\nD-1, high ,js/sql-injection,apps/example.js',
    { source: 'daybreak' }
  );
  assert.equal(csv.findings[0].severity, 'high');
  const json = parseDocument([{ ...base, severity: ' HIGH ' }]);
  assert.equal(json.findings[0].severity, 'high');
});

test('literal JSON/CSV paths survive percent signs while SARIF URIs decode safely', () => {
  const csv = parseDocument('id,rule,file\nD-1,js/sql-injection,apps/100%.js');
  assert.equal(csv.findings[0].file, 'apps/100%.js');
  for (const file of ['apps/100%.js', 'apps/literal%20name.js']) {
    const result = parseDocument([{ ...base, file }]);
    assert.equal(result.findings[0].file, file);
    assert.deepEqual(result.warnings, []);
  }
  for (const [uri, expected] of [
    ['file:///workspace/Jovie/apps/100%25.js', 'apps/100%.js'],
    ['apps/a%20b.js', 'apps/a b.js'],
    ['apps/100%.js', 'apps/100%.js'],
    ['apps/%E0%A4%A.js', 'apps/%E0%A4%A.js'],
  ]) {
    const result = parseDocument(sarifDocument({ uri }));
    assert.equal(result.findings[0].file, expected);
  }
  const jsonUri = parseDocument([
    { rule_id: base.rule_id, location: { uri: 'apps/a%20b.js' } },
  ]);
  assert.equal(jsonUri.findings[0].file, 'apps/a b.js');
});

test('SARIF keeps CLI and cloud scanner provenance distinct', () => {
  for (const [driver, expected] of [
    ['codex-cli', 'codex-cli'],
    ['Codex CLI', 'codex-cli'],
    ['codexcli', 'codex-cli'],
    ['codex-cloud', 'codex-cloud'],
    ['Codex Cloud', 'codex-cloud'],
    ['Codex', 'codex-cloud'],
    ['Aardvark', 'codex-cli'],
    ['CodeQL', 'codeql'],
  ]) {
    const result = parseDocument(sarifDocument({ driver }));
    assert.equal(result.findings[0].source, expected, driver);
  }
});

test('normalized findings without symbols or real line spans do not match', () => {
  const [left, right] = parseDocument([
    { ...base, symbol: null, id: 'one' },
    { ...base, symbol: null, id: 'two' },
  ]).findings;
  assert.equal(left.start_line, null);
  assert.equal(left.end_line, null);
  assert.equal(sameFinding(left, right), false);
  for (const invalid of [null, undefined, '', 0, -1, 1.5, 'unknown']) {
    assert.equal(
      sameFinding(
        { ...left, start_line: invalid, end_line: invalid },
        { ...right, start_line: invalid, end_line: invalid }
      ),
      false,
      String(invalid)
    );
  }
  assert.equal(
    sameFinding({ ...left, start_line: 10 }, { ...right, end_line: 15 }),
    true
  );
  assert.equal(
    sameFinding({ ...left, symbol: 'GET' }, { ...right, symbol: 'GET' }),
    true
  );
});

test('OSV weekly baseline explicitly scans nested dependency sources', () => {
  const workflow =
    /** @type {{ jobs: { osv: { steps: Array<{ run?: string }> } } }} */ (
      parseYaml(
        readFileSync(
          new URL('../../.github/workflows/security.yml', import.meta.url),
          'utf8'
        )
      )
    );
  const step = workflow.jobs.osv.steps.find(step =>
    step.run?.includes('scan source')
  );
  assert.ok(step);
  // v2.5.1 cmd/osv-scanner/scan/source/command.go defaults recursive=false.
  const command = step.run
    .split('\n')
    .find(line => line.includes('./osv-scanner scan source'));
  assert.match(command, /scan source\s+--recursive\s/);
  assert.ok(command.includes('--no-ignore '));
  assert.ok(
    command.includes(
      '--lockfile requirements.txt:.github/requirements/pytest.txt '
    )
  );
  assert.match(command, /--format sarif --output-file osv\.sarif \.$/);
  assert.match(step.run, /version=v2\.5\.1/);
  assert.match(
    step.run,
    /sha=f9f25499a2c8cc367b3af45df2ea7eeca7fbccceab9c35079968f4b3652194be/
  );
  assert.match(step.run, /sha256sum -c -/);
  assert.match(step.run, /if \[\[ "\$code" -gt 1 \]\]/);
});

test('keys are stable across scanners and line changes', () => {
  const expected = computeKey({
    ...base,
    source: 'codex-cloud',
    start_line: 10,
  });
  assert.match(expected, /^sec-jovie-cwe89-[0-9a-f]{8}$/);
  assert.equal(
    computeKey({ ...base, source: 'codeql', start_line: 900 }),
    expected
  );
  assert.equal(familyOf({ ...base, cwe: [564] }), 'cwe89');
  assert.equal(
    computeKey({ ...base, cwe: [], symbol: 'GET' }),
    expected,
    'the rule-to-CWE map is part of the stable key contract'
  );
  assert.throws(
    () => computeKey({ ...base, repo: 'Other/Repo' }),
    error =>
      error instanceof InvalidFindingError && error.code === 'unknown_repo'
  );
});

test('cross-scanner matches use symbol identity or line overlap within five', () => {
  const left = { ...base, start_line: 10, end_line: 12 };
  assert.equal(sameFinding(left, { ...left, source: 'daybreak' }), true);
  assert.equal(
    sameFinding(left, {
      ...left,
      symbol: 'POST',
      start_line: 17,
      end_line: 18,
    }),
    true
  );
  assert.equal(
    sameFinding(left, {
      ...left,
      symbol: 'POST',
      start_line: 19,
      end_line: 20,
    }),
    false
  );
  assert.equal(
    sameFinding(left, { ...left, cwe: [79], start_line: 10 }),
    false
  );
});

test('merge keeps the first-seen key and strongest evidence', () => {
  const first = {
    ...base,
    key: 'sec-jovie-cwe89-aaaaaaaa',
    source: 'codeql',
    source_id: 'one',
    severity: 'medium',
    validated: false,
    status: 'dismissed',
    coverage: 'complete',
    first_seen: '2026-10-01T00:00:00Z',
  };
  const merged = mergeFindings([
    {
      ...first,
      key: 'sec-jovie-cwe89-bbbbbbbb',
      source: 'codex-cloud',
      source_id: 'two',
      severity: 'high',
      validated: true,
      status: 'open',
      first_seen: '2026-10-02T00:00:00Z',
    },
    first,
  ]);
  assert.equal(merged.key, first.key);
  assert.deepEqual(merged.aliases, ['sec-jovie-cwe89-bbbbbbbb']);
  assert.equal(merged.severity, 'high');
  assert.equal(merged.validated, true);
  assert.equal(merged.conflict, true);
});

test('Codex JSON, Daybreak CSV, and SARIF normalize to one contract', () => {
  const codex = parseDocument({
    findings: [
      {
        id: 'C-1',
        title: 'SQL injection',
        severity: 'high',
        validated: true,
        rule_id: 'js/sql-injection',
        cwes: 'CWE-89',
        file: './apps/web/app/api/users/route.ts',
        symbol: 'GET',
        line: 10,
      },
    ],
  }).findings[0];
  const daybreak = parseDocument(
    'id,title,severity,rule,cwe,file,function,line,unknown\nD-1,SQL injection,high,js/sql-injection,CWE-89,apps/web/app/api/users/route.ts,GET,44,drop-me\n',
    { repo: 'JovieInc/Jovie', source: 'daybreak' }
  );
  assert.equal(daybreak.warnings[0], 'unknown_column');
  assert.equal(JSON.stringify(daybreak).includes('drop-me'), false);
  assert.equal(daybreak.findings[0].key, codex.key);

  const sarif = parseDocument({
    runs: [
      {
        tool: {
          driver: {
            name: 'CodeQL',
            rules: [
              {
                id: 'js/sql-injection',
                properties: {
                  tags: ['external/cwe/cwe-89'],
                  'security-severity': '8.2',
                },
              },
            ],
          },
        },
        results: [
          {
            ruleId: 'js/sql-injection',
            message: { text: 'SQL injection' },
            locations: [
              {
                logicalLocations: [{ fullyQualifiedName: 'GET' }],
                physicalLocation: {
                  artifactLocation: {
                    uri: 'file:///workspace/Jovie/apps/web/app/api/users/route.ts',
                  },
                  region: { startLine: 80, endLine: 81 },
                },
              },
            ],
          },
        ],
      },
    ],
  }).findings[0];
  assert.equal(sarif.source, 'codeql');
  assert.equal(sarif.severity, 'high');
  assert.deepEqual(sarif.cwe, [89]);
  assert.equal(sarif.key, codex.key);
});

test('volume and paging policy follows the remediation contract', () => {
  assert.equal(bucket({ ...base, severity: 'high' }), 'issue');
  assert.equal(
    bucket({ ...base, severity: 'medium' }),
    'group:sec-jovie-cwe89-grp'
  );
  assert.equal(bucket({ ...base, severity: 'low' }), 'ledger');
  assert.equal(
    bucket({ ...base, severity: 'high', source: 'osv', package: 'vite' }),
    'dependency-ledger'
  );
  assert.equal(
    pageWorthy(
      {
        ...base,
        severity: 'high',
        validated: true,
        file: 'apps/web/lib/billing/stripe.ts',
      },
      { baselineDone: true }
    ),
    true
  );
  assert.equal(
    pageWorthy(
      {
        ...base,
        severity: 'high',
        validated: true,
        rule_id: 'codex-authz-bypass',
      },
      { baselineDone: true }
    ),
    true
  );
  assert.equal(
    pageWorthy(
      { ...base, severity: 'high', validated: true },
      { baselineDone: false }
    ),
    false
  );
});

test('the JSON schema preserves the shared remediation-key contract', () => {
  const schema = JSON.parse(
    readFileSync(
      new URL('./findings/finding.schema.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(schema.$id, 'jovie/security-finding/v1');
  assert.ok(schema.required.includes('key'));
  assert.match(computeKey(base), new RegExp(schema.properties.key.pattern));
});

const securityIssue = identifier => ({
  identifier,
  description: [
    'Remediation-Key: sec-jovie-cwe89-9b88791d',
    'Severity: high · Validated: yes',
    'Files: apps/web/app/api/users/route.ts',
  ].join('\n'),
});

test('security gate blocks intersecting highs unless the remediation is claimed', () => {
  const issue = securityIssue('JOV-1');
  assert.deepEqual(parseIssueFooter(issue.description), {
    key: 'sec-jovie-cwe89-9b88791d',
    severity: 'high',
    files: ['apps/web/app/api/users/route.ts'],
  });
  assert.deepEqual(
    blockingIssues([issue], ['apps/web/app/api/users/route.ts']),
    ['JOV-1']
  );
  assert.deepEqual(blockingIssues([issue], ['apps/web/other.ts']), []);
  assert.deepEqual(
    blockingIssues([issue], ['apps/web/app/api/users/route.ts'], {
      prBody: 'Codex-Finding: sec-jovie-cwe89-9b88791d',
    }),
    []
  );
  assert.deepEqual(
    blockingIssues([issue], ['apps/web/app/api/users/route.ts'], {
      labels: ['security-gate:override'],
    }),
    []
  );
  assert.deepEqual(
    blockingIssues([issue], ['apps/web/app/api/users/route.ts'], {
      labels: ['security:claimed-external'],
    }),
    []
  );
});

test('security gate is report-only until explicitly enabled', async () => {
  const off = await runSecurityGate({
    env: { LINEAR_API_KEY: 'test', SECURITY_GATE_ENABLED: '' },
    issues: [securityIssue('JOV-9')],
    changedFiles: ['apps/web/app/api/users/route.ts'],
    prBody: '',
    labels: [],
  });
  assert.deepEqual(off, {
    status: 'report-only',
    blocking: ['JOV-9'],
    exitCode: 0,
  });
  assert.equal(formatGateReport(off).includes('apps/web'), false);
  assert.deepEqual(
    gateDecision({
      hasApiKey: true,
      enabled: true,
      blocking: ['JOV-9'],
    }),
    { status: 'fail', blocking: ['JOV-9'], exitCode: 1 }
  );
  assert.equal(
    gateDecision({
      hasApiKey: true,
      enabled: true,
      unavailable: true,
    }).reason,
    'linear_unavailable'
  );
});

test('a bounded Linear inventory must finish pagination before passing', async () => {
  for (const enabled of [true, false]) {
    const cursors = [];
    const decision = await runSecurityGate({
      env: { LINEAR_API_KEY: 'test', SECURITY_GATE_ENABLED: String(enabled) },
      changedFiles: [base.file],
      prBody: '',
      labels: [],
      fetchImpl: async (_url, init) => {
        cursors.push(JSON.parse(init.body).variables.after);
        return {
          ok: true,
          json: async () => ({
            data: {
              issues: {
                nodes: [],
                pageInfo: {
                  hasNextPage: true,
                  endCursor: `page-${cursors.length}`,
                },
              },
            },
          }),
        };
      },
    });
    assert.deepEqual(cursors, [null, 'page-1', 'page-2', 'page-3', 'page-4']);
    assert.deepEqual(decision, {
      status: enabled ? 'fail' : 'report-only',
      reason: 'linear_unavailable',
      blocking: [],
      exitCode: enabled ? 1 : 0,
    });
  }
});

test('a complete fifth Linear page retains earlier blockers and can pass empty', async () => {
  for (const includeBlocker of [true, false]) {
    let page = 0;
    const decision = await runSecurityGate({
      env: { LINEAR_API_KEY: 'test', SECURITY_GATE_ENABLED: 'true' },
      changedFiles: [base.file],
      prBody: '',
      labels: [],
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes:
                ++page === 1 && includeBlocker ? [securityIssue('JOV-9')] : [],
              pageInfo: { hasNextPage: page < 5, endCursor: `page-${page}` },
            },
          },
        }),
      }),
    });
    assert.equal(page, 5);
    assert.deepEqual(decision, {
      status: includeBlocker ? 'fail' : 'pass',
      blocking: includeBlocker ? ['JOV-9'] : [],
      exitCode: includeBlocker ? 1 : 0,
    });
  }
});

test('missing or repeated Linear cursors cannot certify a complete inventory', async () => {
  for (const endCursor of [null, 'repeated']) {
    let calls = 0;
    const decision = await runSecurityGate({
      env: { LINEAR_API_KEY: 'test', SECURITY_GATE_ENABLED: 'true' },
      changedFiles: [base.file],
      prBody: '',
      labels: [],
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: true,
          json: async () => ({
            data: {
              issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor } },
            },
          }),
        };
      },
    });
    assert.equal(calls, endCursor ? 2 : 1);
    assert.equal(decision.status, 'fail');
    assert.equal(decision.reason, 'linear_unavailable');
    assert.equal(decision.exitCode, 1);
  }
});

test('report-only unavailable evidence differs from a successful empty lookup', async () => {
  const run = fetchImpl =>
    runSecurityGate({
      env: { LINEAR_API_KEY: 'test' },
      changedFiles: [base.file],
      prBody: '',
      labels: [],
      fetchImpl,
    });
  for (const response of [
    { ok: false },
    {
      ok: true,
      json: async () => ({ errors: [{ message: 'synthetic error' }] }),
    },
    { ok: true, json: async () => ({ data: { issues: null } }) },
    { ok: true, json: async () => ({ data: { issues: { nodes: [] } } }) },
  ]) {
    const decision = await run(async () => response);
    assert.deepEqual(decision, {
      status: 'report-only',
      reason: 'linear_unavailable',
      blocking: [],
      exitCode: 0,
    });
    assert.equal(
      formatGateReport(decision),
      'security-gate: report-only\nlinear_unavailable\nnone\n'
    );
  }
  const offline = await run(async () => {
    throw new Error('synthetic offline');
  });
  assert.equal(offline.reason, 'linear_unavailable');
  assert.equal(offline.exitCode, 0);
  const empty = await run(async () => ({
    ok: true,
    json: async () => ({
      data: { issues: { nodes: [], pageInfo: { hasNextPage: false } } },
    }),
  }));
  assert.deepEqual(empty, { status: 'report-only', blocking: [], exitCode: 0 });
  assert.equal(formatGateReport(empty), 'security-gate: report-only\nnone\n');
});

test('a report-only merge group spends no GitHub or Linear read', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    throw new Error('no network in a report-only merge group');
  };
  const decision = await runSecurityGate({
    env: { LINEAR_API_KEY: 'test', GITHUB_EVENT_NAME: 'merge_group' },
    fetchImpl,
  });
  assert.deepEqual(decision, {
    status: 'report-only',
    reason: 'merge_group_report_skipped',
    blocking: [],
    exitCode: 0,
  });
  assert.deepEqual(calls, []);
  const enforced = await runSecurityGate({
    env: {
      LINEAR_API_KEY: 'test',
      GITHUB_EVENT_NAME: 'merge_group',
      SECURITY_GATE_ENABLED: 'true',
    },
    fetchImpl,
  });
  assert.equal(
    enforced.status,
    'fail',
    'an enforced gate still reads and fails closed'
  );
  assert.ok(calls.length > 0);
});

test('missing Linear credentials skip without exposing finding details', async () => {
  const summary = join(
    mkdtempSync(join(tmpdir(), 'security-gate-')),
    'summary'
  );
  const decision = await runSecurityGate({
    env: {},
    summaryPath: summary,
    issues: [securityIssue('JOV-9')],
    changedFiles: ['apps/web/app/api/users/route.ts'],
  });
  assert.equal(decision.status, 'skipped');
  assert.equal(decision.exitCode, 0);
  const output = readFileSync(summary, 'utf8');
  assert.match(output, /missing_linear_api_key/);
  assert.equal(output.includes('users/route.ts'), false);
});
