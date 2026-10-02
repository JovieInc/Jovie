import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  evaluateEscapedDefectClosure,
  MAX_AUTOMATIC_REMEDIATION_ATTEMPTS,
} from './lib/escaped-defect-closure.mjs';
import { transitionLinearIssue } from './linear-transition-issue.mjs';
import {
  buildTestIndex,
  collectAll,
  collectChangedCodeGaps,
  collectComponentStateGaps,
  collectCoverageGaps,
  collectEscapedDefectClosureGaps,
  collectEscapedDefectGaps,
  collectInvariantGaps,
  collectPostmortemGaps,
  collectRouteBudgetGaps,
  fetchExistingFingerprints,
  fetchRecentDefects,
  fingerprintOf,
  hasTest,
  issueDescription,
  issueTitle,
  LABEL_LOW,
  MAX_LOW_PER_DAY,
  moduleCoverage,
  readPostmortems,
  readRunnerIncludePrefixes,
  route,
  routeFromPage,
  selectForFiling,
} from './quality-gap-finder.mjs';

const roots = [];
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'quality-gap-finder-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const COMPONENT = 'export function Card() { return null; }\n';
const DEPLOYED_SHA = 'a'.repeat(40);

function escapedDefectEvidence(overrides = {}) {
  const evidence = {
    schema: 'jovie.escaped-defect-closure/v1',
    originatingIssue: 'JOV-9',
    reproduction: {
      evidenceRef: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    },
    productRepair: {
      fixRef: 'https://github.com/JovieInc/Jovie/pull/9',
      deployedBuild: {
        sha: DEPLOYED_SHA,
        url: 'https://jovie-example-jovie.vercel.app',
        deploymentId: 'dpl_exact_build_123',
        evidenceRef:
          'https://github.com/JovieInc/Jovie/actions/runs/1#production-verified',
        verifiedAt: '2026-09-28T10:00:00Z',
      },
      journeyRetestRef:
        'https://github.com/JovieInc/Jovie/actions/runs/2#original-report',
    },
    detection: {
      originatingIssue: 'JOV-9',
      gapClass: 'missing-invariant',
      gapAnalysis:
        'Certification covered render success but not the failed interaction outcome.',
      detectorRef: 'scripts/quality-gap-finder.test.mjs',
      coveredClass: 'escaped defects closed without paired detector evidence',
      deliberateRedRef:
        'https://github.com/JovieInc/Jovie/actions/runs/3#deliberate-red',
    },
    remediation: { mode: 'not-automatic' },
    ...overrides,
  };
  return `<!-- escaped-defect-closure:v1\n${JSON.stringify(evidence)}\n-->`;
}

describe('quality-gap-finder', () => {
  it('fingerprints are stable per kind and key', () => {
    assert.equal(fingerprintOf('a', 'b'), fingerprintOf('a', 'b'));
    assert.notEqual(fingerprintOf('a', 'b'), fingerprintOf('a', 'c'));
    assert.match(fingerprintOf('a', 'b'), /^qg-[0-9a-f]{8}$/);
  });

  describe('invariant evidence', () => {
    const invariant = (id, tests, state = 'adopted') => ({
      id,
      title: id,
      lifecycle: { state },
      evidence: { tests, deliberateRed: [] },
    });

    it('flags an invariant with no enforcing test', () => {
      const [gap] = collectInvariantGaps(
        [invariant('JOV-INV-900', [], 'binding')],
        ''
      );
      assert.equal(gap.kind, 'invariant-evidence-unwired');
      assert.ok(gap.confidence >= 0.75);
    });

    it('flags evidence no CI command runs, and skips wired or superseded ones', () => {
      const gaps = collectInvariantGaps(
        [
          invariant('JOV-INV-901', [{ path: 'scripts/a/unwired.test.mjs' }]),
          invariant('JOV-INV-902', [{ path: 'scripts/a/wired.test.mjs' }]),
          invariant('JOV-INV-903', [
            { path: 'scripts/lib/__tests__/x.test.mjs' },
          ]),
          invariant('JOV-INV-904', [], 'superseded'),
        ],
        'node --test scripts/a/wired.test.mjs',
        ['scripts/lib/__tests__/']
      );
      assert.deepEqual(
        gaps.map(gap => gap.key),
        ['JOV-INV-901:scripts/a/unwired.test.mjs']
      );
      assert.equal(gaps[0].mechanical, true);
    });

    it('skips evidence owned by another repo', () => {
      const gaps = collectInvariantGaps(
        [
          invariant('JOV-INV-905', [
            {
              path: 'scripts/tests/test_openai_symphony_install.py',
              repo: 'JovieInc/symphony-control',
            },
            { path: 'scripts/a/unwired.test.mjs' },
          ]),
        ],
        ''
      );
      assert.deepEqual(
        gaps.map(gap => gap.key),
        ['JOV-INV-905:scripts/a/unwired.test.mjs']
      );
    });

    it('reads Vitest include globs as runner prefixes', () => {
      const root = repo({
        'scripts/vitest.config.mts':
          "export default { test: { include: ['lib/__tests__/**/*.test.mjs'] } };",
      });
      assert.deepEqual(readRunnerIncludePrefixes(root), [
        'scripts/lib/__tests__/',
      ]);
    });
  });

  describe('post-mortem classes', () => {
    const postmortems = [
      {
        path: 'docs/postmortems/a.md',
        classes: ['guarded', 'lonely'],
        actions: [],
      },
      {
        path: 'docs/postmortems/b.md',
        classes: ['tracked'],
        actions: ['JOV-1'],
      },
      { path: 'docs/postmortems/c.md', classes: ['twice'], actions: [] },
      { path: 'docs/postmortems/d.md', classes: ['twice'], actions: [] },
    ];

    it('skips guarded classes and classes with open actions', () => {
      const gaps = collectPostmortemGaps(postmortems, 'x guarded y', {
        'JOV-1': 'started',
      });
      const byKey = Object.fromEntries(gaps.map(gap => [gap.key, gap]));
      assert.equal(byKey.guarded, undefined);
      assert.equal(byKey.tracked, undefined);
      assert.equal(byKey.lonely.confidence, 0.55);
      assert.equal(byKey.twice.confidence, 0.8);
    });

    it('raises a class whose actions all closed without a guardrail', () => {
      const gaps = collectPostmortemGaps(postmortems, '', {
        'JOV-1': 'completed',
      });
      const tracked = gaps.find(gap => gap.key === 'tracked');
      assert.equal(tracked.confidence, 0.8);
      assert.ok(tracked.evidence.some(line => line.includes('JOV-1')));
    });

    it('reads classes and actions from post-mortem frontmatter', () => {
      const root = repo({
        'docs/postmortems/README.md': '# index',
        'docs/postmortems/2026-09-26-x.md':
          '---\nid: x\nfailure_classes: [alpha, beta]\nactions: [JOV-1, JOV-2]\n---\nbody',
      });
      assert.deepEqual(readPostmortems(root), [
        {
          path: 'docs/postmortems/2026-09-26-x.md',
          classes: ['alpha', 'beta'],
          actions: ['JOV-1', 'JOV-2'],
        },
      ]);
    });
  });

  describe('test index', () => {
    const root = repo({
      'apps/web/lib/a/tested.server.ts': 'export const a = 1;',
      'apps/web/tests/unit/lib/a/tested.server.test.ts':
        "import { a } from '@/lib/a/tested.server';",
      'apps/web/lib/b/barrel/part.ts': 'export const b = 1;',
      'apps/web/tests/unit/barrel.test.ts': "import x from '@/lib/b/barrel';",
      'apps/web/lib/c/untested.ts': 'export const c = 1;',
      'apps/web/lib/d/inner.ts': 'export const d = 1;',
      'apps/web/proxy.ts': "import { d } from '@/lib/d/inner';",
      'apps/web/tests/unit/proxy.test.ts': "import '@/proxy';",
      'apps/web/app/api/auth/native/handback/route.ts': 'export {}',
      'apps/web/tests/unit/api/native-handback.test.ts': 'test',
    });
    const index = buildTestIndex(root);

    it('matches tests by import tail, barrel, one-hop importer, and route name', () => {
      assert.equal(hasTest('apps/web/lib/a/tested.server.ts', index), true);
      assert.equal(hasTest('apps/web/lib/b/barrel/part.ts', index), true);
      assert.equal(hasTest('apps/web/lib/d/inner.ts', index), true);
      assert.equal(
        hasTest('apps/web/app/api/auth/native/handback/route.ts', index),
        true
      );
      assert.equal(hasTest('apps/web/lib/c/untested.ts', index), false);
    });

    it('proposes only untested changed code, above the noise floor', () => {
      const churn = new Map([
        ['apps/web/lib/c/untested.ts', 2],
        ['apps/web/lib/a/tested.server.ts', 5],
      ]);
      const gaps = collectChangedCodeGaps(churn, root, index);
      assert.deepEqual(
        gaps.map(gap => gap.key),
        ['apps/web/lib/c/untested.ts']
      );
      const single = collectChangedCodeGaps(
        new Map([['apps/web/lib/c/untested.ts', 1]]),
        root,
        index
      );
      assert.equal(route(single).length, 0);
    });
  });

  it('proposes changed components with neither story nor test', () => {
    const root = repo({
      'packages/ui/atoms/bare.tsx': COMPONENT,
      'packages/ui/atoms/storied.tsx': COMPONENT,
      'packages/ui/atoms/storied.stories.tsx': 'x',
    });
    const gaps = collectComponentStateGaps(
      new Map([
        ['packages/ui/atoms/bare.tsx', 1],
        ['packages/ui/atoms/storied.tsx', 4],
      ]),
      root,
      buildTestIndex(root)
    );
    assert.deepEqual(
      gaps.map(gap => gap.key),
      ['packages/ui/atoms/bare.tsx']
    );
    assert.ok(gaps[0].confidence >= 0.75);
  });

  it('turns an escaped defect naming an untested source file into a proposal', () => {
    const root = repo({
      'apps/web/components/organisms/Banner.tsx': COMPONENT,
      'apps/web/components/organisms/Tested.tsx': COMPONENT,
      'apps/web/components/organisms/Tested.test.tsx': 'x',
    });
    const gaps = collectEscapedDefectGaps(
      [
        {
          id: 'JOV-1',
          title: 'banner covers HUD',
          description:
            'see `components/organisms/Banner.tsx` and `apps/web/components/organisms/Tested.tsx` and `apps/web/components/organisms/Tested.test.tsx`',
          statusType: 'completed',
          labels: ['dogfood', 'area:ovie'],
        },
        {
          id: 'JOV-2',
          title: 'feature idea',
          description: '`components/organisms/Banner.tsx`',
          labels: ['feature'],
        },
      ],
      root,
      buildTestIndex(root)
    );
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].key, 'JOV-1:apps/web/components/organisms/Banner.tsx');
    assert.equal(gaps[0].confidence, 0.85);
    assert.equal(gaps[0].area, 'area:ovie');
  });

  describe('escaped defect closure', () => {
    it('deliberate red: catches a completed defect with no paired closure evidence', () => {
      const [gap] = collectEscapedDefectClosureGaps([
        {
          id: 'JOV-9',
          title: 'reported journey failed in production',
          description: 'The product fix shipped.',
          statusType: 'completed',
          labels: ['escaped-defect'],
        },
      ]);

      assert.equal(gap.kind, 'escaped-defect-closure-unverified');
      assert.equal(gap.originatingIssue, 'JOV-9');
      assert.equal(gap.confidence, 1);
      assert.match(gap.evidence.join('\n'), /missing escaped-defect-closure/);
      assert.match(
        issueDescription({ ...gap, lane: 'issue' }),
        /Originating defect: JOV-9/
      );
    });

    it('accepts paired exact-build repair and reusable detector evidence', () => {
      const issue = {
        identifier: 'JOV-9',
        description: escapedDefectEvidence(),
        labels: ['escaped-defect'],
      };
      const result = evaluateEscapedDefectClosure(issue, {
        expectedDeploymentSha: DEPLOYED_SHA,
      });

      assert.equal(result.ok, true);
      assert.deepEqual(result.errors, []);
      const wrongBuild = evaluateEscapedDefectClosure(issue, {
        expectedDeploymentSha: 'b'.repeat(40),
      });
      assert.equal(wrongBuild.ok, false);
      assert.match(wrongBuild.errors.join('\n'), /must match/);
      assert.deepEqual(
        collectEscapedDefectClosureGaps([
          {
            ...issue,
            id: 'JOV-9',
            title: 'reported journey failed in production',
            statusType: 'completed',
          },
        ]),
        []
      );
    });

    it('deliberate red: reintroduced failure is rejected without detector proof', () => {
      const marker = escapedDefectEvidence({
        detection: {
          originatingIssue: 'JOV-9',
          gapClass: 'missing-invariant',
          gapAnalysis:
            'Certification covered render success but not the failed interaction outcome.',
          detectorRef: 'scripts/quality-gap-finder.test.mjs',
          coveredClass: 'escaped interaction failures across product journeys',
        },
      });
      const result = evaluateEscapedDefectClosure({
        identifier: 'JOV-9',
        description: marker,
        labels: ['escaped-defect'],
      });

      assert.equal(result.ok, false);
      assert.ok(
        result.errors.some(error => error.includes('deliberateRedRef'))
      );
    });

    it('requires bounded automatic remediation and an explicit blocked exhaustion state', () => {
      const invalid = escapedDefectEvidence({
        remediation: {
          mode: 'automatic',
          budget: {
            maxAttempts: MAX_AUTOMATIC_REMEDIATION_ATTEMPTS + 1,
            wallClockMs: Number.POSITIVE_INFINITY,
            maxSpendUsd: Number.POSITIVE_INFINITY,
          },
          exhaustion: { state: 'retrying' },
        },
      });
      const rejected = evaluateEscapedDefectClosure({
        identifier: 'JOV-9',
        description: invalid,
        labels: ['escaped-defect'],
      });
      assert.equal(rejected.ok, false);
      assert.match(rejected.errors.join('\n'), /maxAttempts/);
      assert.match(rejected.errors.join('\n'), /wallClockMs/);
      assert.match(rejected.errors.join('\n'), /maxSpendUsd/);
      assert.match(rejected.errors.join('\n'), /state must be blocked/);
      assert.match(rejected.errors.join('\n'), /nextAction is required/);

      const bounded = escapedDefectEvidence({
        remediation: {
          mode: 'automatic',
          budget: {
            maxAttempts: MAX_AUTOMATIC_REMEDIATION_ATTEMPTS,
            wallClockMs: 600_000,
            maxSpendUsd: 5,
          },
          exhaustion: {
            state: 'blocked',
            reason: 'retry budget exhausted after three failed repairs',
            owner: 'Summer',
            evidenceRef: 'https://github.com/JovieInc/Jovie/actions/runs/4',
            nextAction: 'route the exact receipt to the owning repair issue',
          },
        },
      });
      const accepted = evaluateEscapedDefectClosure({
        identifier: 'JOV-9',
        description: bounded,
        labels: ['escaped-defect'],
      });
      assert.equal(accepted.ok, true);
    });

    it('accepts only an explicit evidenced detector non-applicability disposition', () => {
      const marker = escapedDefectEvidence({
        detection: {
          originatingIssue: 'JOV-9',
          gapAnalysis:
            'The defect came from an external physical failure with no machine-observable product state.',
          nonApplicability: {
            justification:
              'No reusable software detector can observe the external physical-only failure class.',
            evidenceRef:
              'https://linear.app/jovie/issue/JOV-9#non-applicability',
            approvedBy: 'Summer',
          },
        },
      });
      const result = evaluateEscapedDefectClosure({
        identifier: 'JOV-9',
        description: marker,
        labels: ['escaped-defect'],
      });

      assert.equal(result.ok, true);
    });

    it('guards the real Done transition and never mutates an incomplete escaped defect', async () => {
      const incompleteCalls = [];
      await assert.rejects(
        transitionLinearIssue({
          identifier: 'JOV-9',
          apiKey: 'lin_test',
          expectedDeploymentSha: DEPLOYED_SHA,
          log: () => {},
          fetchImpl: async (_url, init) => {
            incompleteCalls.push(String(init?.body ?? ''));
            return {
              ok: true,
              json: async () => ({
                data: {
                  issues: {
                    nodes: [
                      {
                        id: 'issue-9',
                        identifier: 'JOV-9',
                        description: 'product fix only',
                        labels: { nodes: [{ name: 'escaped-defect' }] },
                        comments: { nodes: [] },
                        team: {
                          states: {
                            nodes: [{ id: 'done-id', name: 'Done' }],
                          },
                        },
                      },
                    ],
                  },
                },
              }),
            };
          },
        }),
        /Refusing to mark JOV-9 Done/
      );
      assert.equal(
        incompleteCalls.some(call => call.includes('issueUpdate')),
        false
      );

      const completeCalls = [];
      const transitioned = await transitionLinearIssue({
        identifier: 'JOV-9',
        apiKey: 'lin_test',
        expectedDeploymentSha: DEPLOYED_SHA,
        log: () => {},
        fetchImpl: async (_url, init) => {
          const body = String(init?.body ?? '');
          completeCalls.push(body);
          if (body.includes('issueUpdate')) {
            return {
              ok: true,
              json: async () => ({
                data: { issueUpdate: { success: true } },
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              data: {
                issues: {
                  nodes: [
                    {
                      id: 'issue-9',
                      identifier: 'JOV-9',
                      description: escapedDefectEvidence(),
                      labels: { nodes: [{ name: 'escaped-defect' }] },
                      comments: { nodes: [] },
                      team: {
                        states: {
                          nodes: [{ id: 'done-id', name: 'Done' }],
                        },
                      },
                    },
                  ],
                },
              },
            }),
          };
        },
      });
      assert.deepEqual(transitioned, { identifier: 'JOV-9', state: 'Done' });
      assert.equal(
        completeCalls.some(call => call.includes('issueUpdate')),
        true
      );
    });

    it('rejects another issue closure receipt fetched through the real Linear adapter', async () => {
      const issues = await fetchRecentDefects(
        'lin_test',
        30,
        async (_url, init) => {
          const { query } = JSON.parse(String(init?.body ?? '{}'));
          return {
            ok: true,
            json: async () => ({
              data: query.includes('EscapedDefectClosureComments')
                ? {
                    i0: {
                      identifier: 'JOV-10',
                      comments: { nodes: [{ body: escapedDefectEvidence() }] },
                    },
                  }
                : {
                    issues: {
                      nodes: [
                        {
                          identifier: 'JOV-10',
                          title: 'different defect',
                          state: { name: 'Done', type: 'completed' },
                          labels: { nodes: [{ name: 'escaped-defect' }] },
                        },
                      ],
                    },
                  },
            }),
          };
        }
      );
      const [gap] = collectEscapedDefectClosureGaps(issues);
      assert.ok(gap, 'receipt for JOV-9 must not close JOV-10');
      assert.equal(gap.originatingIssue, 'JOV-10');
      assert.match(gap.evidence.join('\n'), /originatingIssue/);
    });

    it('fetches comments only for completed escaped-defect closure candidates', async () => {
      const queries = [];
      const issues = await fetchRecentDefects(
        'lin_test',
        30,
        async (_url, init) => {
          const body = JSON.parse(String(init?.body ?? '{}'));
          queries.push(body.query);
          if (body.query.includes('EscapedDefectClosureComments')) {
            return {
              ok: true,
              json: async () => ({
                data: {
                  i0: {
                    identifier: 'JOV-9',
                    comments: { nodes: [{ body: escapedDefectEvidence() }] },
                  },
                },
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              data: {
                issues: {
                  nodes: [
                    {
                      identifier: 'JOV-9',
                      title: 'escaped',
                      description: '',
                      state: { name: 'Done', type: 'completed' },
                      labels: { nodes: [{ name: 'escaped-defect' }] },
                    },
                    {
                      identifier: 'JOV-10',
                      title: 'ordinary bug',
                      description: '',
                      state: { name: 'Done', type: 'completed' },
                      labels: { nodes: [{ name: 'bug' }] },
                    },
                    {
                      identifier: 'JOV-11',
                      title: 'open escaped defect',
                      description: '',
                      state: { name: 'In Progress', type: 'started' },
                      labels: { nodes: [{ name: 'escaped-defect' }] },
                    },
                  ],
                },
              },
            }),
          };
        }
      );

      assert.equal(queries.length, 2);
      assert.match(queries[1], /issue\(id: "JOV-9"\)/);
      assert.doesNotMatch(queries[1], /JOV-10|JOV-11/);
      assert.equal(issues[0].comments.length, 1);
      assert.deepEqual(issues[1].comments, []);
      assert.deepEqual(issues[2].comments, []);
    });
  });

  it('flags a stale heatmap and module coverage drops', () => {
    const summary = {
      total: {},
      '/r/apps/web/lib/auth/a.ts': { lines: { covered: 5, total: 10 } },
    };
    const baseline = {
      '/r/apps/web/lib/auth/a.ts': { lines: { covered: 9, total: 10 } },
    };
    assert.deepEqual(moduleCoverage(summary), { 'apps/web/lib/auth': 50 });
    const gaps = collectCoverageGaps({
      heatmap: '<!-- Generated: 2026-05-10T23:55:09.543Z -->',
      now: new Date('2026-09-26T00:00:00Z'),
      summary,
      baseline,
    });
    assert.deepEqual(
      gaps.map(gap => gap.key),
      ['docs/TEST_COVERAGE_HEATMAP.md', 'drop:apps/web/lib/auth']
    );
    assert.deepEqual(
      collectCoverageGaps({
        heatmap: 'Generated: 2026-09-20T00:00:00Z',
        now: new Date('2026-09-26T00:00:00Z'),
      }),
      []
    );
  });

  it('groups public routes without budgets and ignores private ones', () => {
    assert.equal(
      routeFromPage('apps/web/app/(marketing)/blog/[slug]/page.tsx'),
      '/blog/[slug]'
    );
    assert.equal(routeFromPage('apps/web/app/(home)/page.tsx'), '/');
    const gaps = collectRouteBudgetGaps(
      [
        'apps/web/app/(marketing)/blog/page.tsx',
        'apps/web/app/(marketing)/blog/[slug]/page.tsx',
        'apps/web/app/[username]/pay/page.tsx',
        'apps/web/app/[username]/page.tsx',
        'apps/web/app/app/(shell)/chat/page.tsx',
        'apps/web/app/api/x/page.tsx',
      ],
      new Set(['/[username]'])
    );
    assert.deepEqual(
      gaps.map(gap => [gap.key, gap.evidence.length]),
      [
        ['public-profile', 1],
        ['/blog', 2],
      ]
    );
  });

  describe('routing, dedupe, and caps', () => {
    const make = (n, confidence) =>
      Array.from({ length: n }, (_, index) => ({
        fingerprint: fingerprintOf('k', `${confidence}-${index}`),
        kind: 'k',
        key: `${index}`,
        title: `t${index}`,
        confidence,
        impact: 1,
        mechanical: true,
        evidence: ['e'],
        suggestion: 's',
      }));

    it('caps needs-tim cards per day and suppresses anything already filed', () => {
      const high = make(7, 0.9);
      const low = make(5, 0.6);
      const noise = make(2, 0.3);
      const existing = new Set([high[0].fingerprint, low[0].fingerprint]);
      const picked = selectForFiling([...high, ...low, ...noise], {
        existing,
        lowFiledToday: 1,
        maxHigh: 5,
      });
      const lanes = picked.file.map(item => item.lane);
      assert.equal(lanes.filter(lane => lane === 'issue').length, 5);
      assert.equal(
        lanes.filter(lane => lane === 'needs-tim').length,
        MAX_LOW_PER_DAY - 1
      );
      assert.equal(picked.suppressed.length, 2);
      assert.ok(
        !picked.file.some(item => existing.has(item.fingerprint)),
        'already-filed fingerprints must not be refiled'
      );
      assert.ok(!picked.file.some(item => item.confidence < 0.5));
    });

    it('stops filing needs-tim cards once the daily cap is spent', () => {
      const picked = selectForFiling(make(4, 0.6), {
        lowFiledToday: MAX_LOW_PER_DAY,
      });
      assert.equal(picked.file.length, 0);
      assert.equal(picked.deferred.length, 4);
    });

    it('writes the fingerprint into the title and the Tim handoff into low cards', () => {
      const [item] = route(make(1, 0.6));
      assert.ok(issueTitle(item).startsWith(`[${item.fingerprint}]`));
      const body = issueDescription(item, 'https://run');
      assert.match(body, /needs Tim/);
      assert.match(
        body,
        new RegExp(`quality-gap-fingerprint: ${item.fingerprint}`)
      );
    });

    it("reads existing fingerprints and counts today's needs-tim cards", async () => {
      const now = new Date('2026-09-26T18:00:00Z');
      const fetchImpl = async () => ({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                {
                  title: '[qg-0000aaaa] Quality gap: a',
                  createdAt: '2026-09-26T09:00:00Z',
                  labels: { nodes: [{ name: LABEL_LOW }] },
                },
                {
                  title: '[qg-0000bbbb] Quality gap: b',
                  createdAt: '2026-09-25T09:00:00Z',
                  labels: { nodes: [{ name: LABEL_LOW }] },
                },
                {
                  title: 'unrelated',
                  createdAt: '2026-09-26T09:00:00Z',
                  labels: { nodes: [] },
                },
              ],
            },
          },
        }),
      });
      const result = await fetchExistingFingerprints('key', now, fetchImpl);
      assert.deepEqual([...result.existing].sort(), [
        'qg-0000aaaa',
        'qg-0000bbbb',
      ]);
      assert.equal(result.lowFiledToday, 1);
    });
  });

  it('runs every collector end to end on a small repo without network', () => {
    const root = repo({
      'canon/invariants.jsonl': `${JSON.stringify({ schema: 'x' })}\n${JSON.stringify(
        {
          id: 'JOV-INV-901',
          title: 'x',
          lifecycle: { state: 'binding' },
          evidence: { tests: [], deliberateRed: [] },
        }
      )}\n`,
      'package.json': '{}',
      'docs/postmortems/README.md': '# index',
      'docs/TEST_COVERAGE_HEATMAP.md': 'Generated: 2026-01-01T00:00:00Z',
      'apps/web/app/(marketing)/blog/page.tsx': COMPONENT,
    });
    const proposals = collectAll({
      repoRoot: root,
      now: new Date('2026-09-26T00:00:00Z'),
      runGit: () => '',
    });
    assert.deepEqual(proposals.map(item => item.kind).sort(), [
      'coverage-evidence-stale',
      'invariant-evidence-unwired',
      'route-budget-missing',
    ]);
  });
});
