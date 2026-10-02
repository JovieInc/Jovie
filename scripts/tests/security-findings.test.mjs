import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  computeKey,
  InvalidKeyError,
  match,
  merge,
  resolveSymbol,
} from '../security/findings/fingerprint.mjs';
import { parseDocument } from '../security/findings/normalize.mjs';
import { bucket, pageWorthy } from '../security/findings/policy.mjs';
import {
  blockingIssues,
  formatGateReport,
  gateDecision,
  parseIssueFooter,
  runSecurityGate,
} from '../security/security-gate.mjs';

const vectors = JSON.parse(
  readFileSync(
    new URL('../security/findings/fixtures/keys.json', import.meta.url),
    'utf8'
  )
);

test('shared key vectors stay stable across scanners and line drift', () => {
  assert.ok(vectors.vectors.length >= 25);
  for (const vector of vectors.vectors) {
    if (vector.throws) {
      assert.throws(
        () => computeKey(vector.finding),
        error => {
          assert.ok(error instanceof InvalidKeyError);
          assert.equal(error.code, vector.throws);
          return true;
        }
      );
      continue;
    }
    assert.equal(computeKey(vector.finding), vector.expectKey, vector.id);
  }
  const byId = Object.fromEntries(
    vectors.vectors.map(vector => [vector.id, vector.expectKey])
  );
  assert.equal(byId['codex-sarif-same-key'], byId['codeql-same-key']);
  assert.equal(byId['line-drift-same-symbol'], byId['codex-sarif-same-key']);
  assert.equal(byId['file-level-no-symbol'], byId['file-level-other-line']);
  assert.match(byId['secret-gitleaks'], /-cwe798-/);
  assert.match(byId['family-564-to-89'], /-cwe89-/);
  assert.match(byId['rule-only-class-slug'], /-codex-authz-bypass-/);
  assert.equal(byId['invalid-key-guard'], null);
});

test('resolveSymbol walks JS, Swift, and Python and returns empty when none', () => {
  const js = 'export async function GET() {\n  return 1;\n}\n';
  assert.equal(resolveSymbol('app/route.ts', 2, null, { content: js }), 'GET');
  const arrow = 'const loadUser = (id) => {\n  return id;\n};\n';
  assert.equal(resolveSymbol('a.ts', 2, null, { content: arrow }), 'loadUser');
  const klass = 'class User {\n  save() {\n    return 1;\n  }\n}\n';
  assert.equal(resolveSymbol('a.ts', 3, null, { content: klass }), 'User.save');
  const swift = 'struct Box {\n  func open() {\n    return\n  }\n}\n';
  assert.equal(
    resolveSymbol('Box.swift', 3, null, { content: swift }),
    'Box.open'
  );
  const python = 'class Row:\n    def read(self):\n        return 1\n';
  assert.equal(
    resolveSymbol('row.py', 3, null, { content: python }),
    'Row.read'
  );
  assert.equal(
    resolveSymbol('a.ts', 1, null, { content: 'const x = 1;\n' }),
    ''
  );
  assert.equal(
    computeKey(
      {
        repo: 'JovieInc/Jovie',
        file: 'app/route.ts',
        cwe: [89],
        rule_id: 'js/sql-injection',
        start_line: 2,
      },
      { content: js, resolveSymbol: true }
    ),
    computeKey({
      repo: 'JovieInc/Jovie',
      file: 'app/route.ts',
      cwe: [89],
      rule_id: 'js/sql-injection',
      symbol: 'GET',
    })
  );
});

test('match and merge keep one canonical key', () => {
  const left = {
    repo: 'JovieInc/Jovie',
    file: 'apps/web/a.ts',
    cwe: [564],
    symbol: 'query',
    start_line: 10,
    end_line: 12,
    source: 'codeql',
    source_id: '1',
    severity: 'medium',
    validated: false,
    title: 'codeql title',
    status: 'dismissed',
    coverage: 'complete',
    key: 'sec-jovie-cwe89-aaaaaaaa',
    first_seen: '2026-10-01T00:00:00Z',
  };
  const right = {
    ...left,
    cwe: [89],
    source: 'codex-cloud',
    source_id: 'F1',
    severity: 'high',
    validated: true,
    title: 'codex title',
    status: 'open',
    key: 'sec-jovie-cwe89-bbbbbbbb',
    first_seen: '2026-10-02T00:00:00Z',
    start_line: 40,
  };
  assert.equal(match(left, right), true);
  assert.equal(
    match(left, { ...right, symbol: 'other', start_line: 14 }),
    true
  );
  assert.equal(
    match(left, { ...right, symbol: 'other', start_line: 30, end_line: 32 }),
    false
  );
  assert.equal(
    match(left, { ...right, symbol: 'other', commit_sha: 'b'.repeat(40) }),
    false
  );
  assert.equal(
    match(
      { ...left, commit_sha: 'a'.repeat(40) },
      { ...right, symbol: 'other', commit_sha: 'b'.repeat(40), start_line: 14 },
      { mapLines: () => ({ left, right: { ...right, start_line: 11 } }) }
    ),
    true
  );
  const merged = merge([right, left]);
  assert.equal(merged.key, left.key);
  assert.deepEqual(merged.aliases, [right.key]);
  assert.equal(merged.severity, 'high');
  assert.equal(merged.validated, true);
  assert.equal(merged.title, 'codex title');
  assert.equal(merged.conflict, true);
  assert.equal(merged.sources.length, 2);
});

test('parsers cover SARIF, Codex, CSV, gitleaks, osv, code scanning, and deepsec', () => {
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
                  tags: ['external/cwe/cwe-089'],
                  'security-severity': '9.1',
                },
              },
            ],
          },
        },
        results: [
          {
            ruleId: 'js/sql-injection',
            level: 'warning',
            message: { text: 'query' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'apps/web/lib/db.ts' },
                  region: { startLine: 3, endLine: 4 },
                },
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(sarif.findings[0].source, 'codeql');
  assert.equal(sarif.findings[0].severity, 'critical');
  assert.deepEqual(sarif.findings[0].cwe, [89]);
  assert.equal(sarif.findings[0].key, computeKey(sarif.findings[0]));

  const codex = parseDocument({
    findings: [
      {
        id: 'F1',
        title: 'bypass',
        severity: 'high',
        validated: true,
        rule_id: 'codex-authz-bypass',
        file: 'apps/web/lib/auth/session.ts',
        symbol: 'requireUser',
        status: 'open',
      },
    ],
  });
  assert.equal(codex.findings[0].source, 'codex-cloud');
  assert.equal(codex.findings[0].validated, true);

  const csv = parseDocument(
    'title,severity,file,mystery\nbypass,high,apps/web/a.ts,keep\n',
    { repo: 'JovieInc/Jovie' }
  );
  assert.deepEqual(csv.warnings, ['unknown_column']);
  assert.equal(csv.findings[0].extra.mystery, 'keep');
  assert.equal(csv.findings[0].title, 'bypass');

  const leaks = parseDocument([
    {
      RuleID: 'generic-api-key',
      File: 'config/keys.env',
      StartLine: 2,
      Description: 'secret',
      Secret: 'super-secret-value',
      Fingerprint: 'fp',
    },
  ]);
  assert.equal(leaks.findings[0].source, 'gitleaks');
  assert.equal(
    JSON.stringify(leaks.findings[0]).includes('super-secret-value'),
    false
  );

  const osv = parseDocument({
    results: [
      {
        source: { path: 'pnpm-lock.yaml' },
        packages: [
          {
            package: { name: 'left-pad' },
            vulnerabilities: [{ id: 'GHSA-1', summary: 'advisory' }],
          },
        ],
      },
    ],
  });
  assert.equal(osv.findings[0].source, 'osv');
  assert.equal(osv.findings[0].package, 'left-pad');
  assert.equal(bucket(osv.findings[0]), 'dependency-ledger');

  const alert = parseDocument({
    number: 45,
    state: 'open',
    html_url: 'https://example.invalid/45',
    tool: { name: 'Semgrep' },
    rule: {
      id: 'js/reflected-xss',
      security_severity_level: 'high',
      tags: ['cwe-79'],
    },
    most_recent_instance: {
      location: { path: 'apps/web/a.ts', start_line: 1, end_line: 1 },
      message: { text: 'xss' },
    },
  });
  assert.equal(alert.findings[0].source, 'semgrep');
  assert.equal(alert.findings[0].source_id, '45');
  assert.deepEqual(alert.findings[0].cwe, [79]);

  const deepsec = parseDocument([
    {
      filePath: 'apps/web/lib/auth/session.ts',
      findings: [
        {
          severity: 'HIGH',
          vulnSlug: 'auth-bypass',
          title: 'skipped',
          lineNumbers: [4, 6],
        },
      ],
    },
  ]);
  assert.equal(deepsec.findings[0].source, 'deepsec');
  assert.equal(deepsec.findings[0].severity, 'high');
  assert.equal(deepsec.findings[0].file, 'apps/web/lib/auth/session.ts');
});

test('policy buckets and pages only post-baseline urgent findings', () => {
  const high = {
    repo: 'JovieInc/Jovie',
    severity: 'high',
    cwe: [89],
    source: 'codeql',
  };
  assert.equal(bucket(high), 'issue');
  assert.equal(bucket({ ...high, severity: 'medium' }), 'group:jovie-cwe89');
  assert.equal(bucket({ ...high, severity: 'low' }), 'ledger');
  assert.equal(bucket({ ...high, severity: 'info' }), 'ledger');
  assert.equal(
    bucket({
      repo: 'JovieInc/Jovie',
      source: 'gitleaks',
      severity: 'high',
      rule_id: 'generic-api-key',
    }),
    'secret-human'
  );
  const secret = {
    ...high,
    source: 'gitleaks',
    validated: true,
    rule_id: 'generic-api-key',
  };
  assert.equal(
    pageWorthy({ ...high, severity: 'critical' }, { baselineDone: false }),
    false
  );
  assert.equal(
    pageWorthy({ ...high, severity: 'critical' }, { baselineDone: true }),
    true
  );
  assert.equal(pageWorthy(secret, { baselineDone: true }), true);
  assert.equal(
    pageWorthy(
      {
        ...high,
        validated: true,
        file: 'apps/web/lib/billing/stripe.ts',
        title: 't',
      },
      { baselineDone: true }
    ),
    true
  );
  assert.equal(
    pageWorthy({ ...high, validated: false }, { baselineDone: true }),
    false
  );
});

const footer = issue => ({
  identifier: issue,
  description: [
    'Remediation-Key: sec-jovie-cwe89-9b88791d',
    'Severity: high · Validated: yes',
    'Files: apps/web/app/api/x/route.ts',
  ].join('\n'),
});

test('security gate intersects files, honors override, and stays report-only', async () => {
  const parsed = parseIssueFooter(footer('JOV-1').description);
  assert.equal(parsed.severity, 'high');
  assert.deepEqual(parsed.files, ['apps/web/app/api/x/route.ts']);
  assert.deepEqual(
    blockingIssues([footer('JOV-1')], ['apps/web/app/api/x/route.ts'], {
      prBody: '',
      labels: [],
    }),
    ['JOV-1']
  );
  assert.deepEqual(
    blockingIssues([footer('JOV-1')], ['apps/web/other.ts'], {
      prBody: '',
      labels: [],
    }),
    []
  );
  assert.deepEqual(
    blockingIssues([footer('JOV-1')], ['apps/web/app/api/x/route.ts'], {
      prBody: 'Remediation-Key: sec-jovie-cwe89-9b88791d',
      labels: [],
    }),
    []
  );
  assert.deepEqual(
    blockingIssues([footer('JOV-1')], ['apps/web/app/api/x/route.ts'], {
      prBody: '',
      labels: ['security-gate:override'],
    }),
    []
  );
  assert.equal(
    blockingIssues(
      [
        {
          identifier: 'JOV-2',
          description: 'Severity: medium\nFiles: apps/web/app/api/x/route.ts',
        },
      ],
      ['apps/web/app/api/x/route.ts'],
      {}
    ).length,
    0
  );

  const off = await runSecurityGate({
    env: { LINEAR_API_KEY: 'test', SECURITY_GATE_ENABLED: '' },
    issues: [footer('JOV-9')],
    changedFiles: ['apps/web/app/api/x/route.ts'],
    prBody: '',
    labels: [],
  });
  assert.equal(off.status, 'report-only');
  assert.equal(off.exitCode, 0);
  assert.deepEqual(off.blocking, ['JOV-9']);
  assert.match(formatGateReport(off), /report-only/);
  assert.equal(formatGateReport(off).includes('apps/web'), false);

  const on = gateDecision({
    hasApiKey: true,
    enabled: true,
    blocking: ['JOV-9'],
  });
  assert.equal(on.exitCode, 1);
  assert.equal(on.status, 'fail');

  const dir = mkdtempSync(join(tmpdir(), 'security-gate-'));
  const summary = join(dir, 'summary.md');
  const missing = await runSecurityGate({
    env: {},
    summaryPath: summary,
    issues: [footer('JOV-9')],
    changedFiles: ['apps/web/app/api/x/route.ts'],
    prBody: '',
    labels: [],
  });
  assert.equal(missing.status, 'skipped');
  assert.equal(missing.reason, 'missing_linear_api_key');
  assert.equal(missing.exitCode, 0);
  const written = readFileSync(summary, 'utf8');
  assert.match(written, /missing_linear_api_key/);
  assert.equal(written.includes('route.ts'), false);
});
