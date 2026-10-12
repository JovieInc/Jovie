import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
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
