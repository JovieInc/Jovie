import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAssuranceMatrix } from '../../invariants/assurance-matrix.mjs';
import {
  auditScreens,
  changedScreenManifest,
  loadArtifacts,
} from '../../invariants/screen-audit.mjs';
import {
  decideScreenAuditReceipt,
  latestManifest,
  produceScreenAuditReceipts,
  rendersSameAs,
} from '../screen-audit-receipts.mjs';
import { deriveValidationManifest } from '../validation-lifecycle.mjs';
import { mergedUiEvidence } from '../validation-sync.mjs';

const OWED = {
  schema: 'jovie.validation-manifest/v1',
  required: [{ kind: 'deployment' }, { kind: 'screen-audit' }],
};
const ledger = verdicts => ({
  screens: Object.entries(verdicts).map(([id, verdict]) => ({
    id,
    verdict,
    findings: verdict === 'red' ? [1, 2] : [],
  })),
});
// apps/web/app/(dynamic)/legal/privacy is owned by web.legal-privacy in the
// SCREEN_REGISTRY; scripts/ paths own no screen.
const SCREEN_PATH = 'apps/web/app/(dynamic)/legal/privacy/page.tsx';
const NO_SCREEN = 'scripts/lib/example.mjs';
// Actual merged paths from Switch #21808 / JOV-5582.
const SWITCH_PATHS = [
  'docs/design-system/design-conformance-manifest.json',
  'packages/ui/atoms/switch.stories.tsx',
  'packages/ui/atoms/switch.test.tsx',
  'packages/ui/atoms/switch.tsx',
];
const TASTE_PATH = 'scripts/invariants/design-surfaces.mjs';

describe('decideScreenAuditReceipt', () => {
  it('skips issues that owe no screen-audit receipt', () => {
    expect(
      decideScreenAuditReceipt({
        manifest: { required: [{ kind: 'deployment' }] },
        mergedFiles: [SCREEN_PATH],
        ledger: ledger({}),
        remediationCreatedAt: {},
      }).action
    ).toBe('skip');
  });

  it('passes, fails or holds on the changed screens verdicts', () => {
    const decide = verdict =>
      decideScreenAuditReceipt({
        manifest: OWED,
        mergedFiles: [SCREEN_PATH],
        ledger: ledger({ 'web.legal-privacy': verdict }),
        remediationCreatedAt: {},
      });
    expect(decide('green').action).toBe('pass');
    expect(decide('red')).toMatchObject({ action: 'fail' });
    expect(decide('red').detail).toContain('web.legal-privacy (2 findings)');
    // Uncovered or missing evidence is never counted green.
    expect(decide('uncovered').action).toBe('hold');
    expect(decide('missing-evidence').action).toBe('hold');
  });

  it('passes a change that owns no screen only while every red screen is tracked', () => {
    const decide = tracked =>
      decideScreenAuditReceipt({
        manifest: OWED,
        mergedFiles: [NO_SCREEN],
        ledger: ledger({ 'web.homepage': 'green', 'web.auth': 'red' }),
        remediationCreatedAt: tracked
          ? { 'web.auth': '2026-10-15T00:00:00Z' }
          : {},
      });
    expect(decide(true).action).toBe('pass');
    expect(decide(true).detail).toContain('web.auth');
    const untracked = decide(false);
    expect(untracked.action).toBe('hold');
    expect(untracked.detail).toContain('no remediation issue yet');
  });

  it.each(['deterministic', 'mixed', 'unknown', undefined])(
    'holds declared %s machine evidence even if the current paths owe none',
    judgment => {
      const decision = decideScreenAuditReceipt({
        manifest: {
          ...OWED,
          uiEvidence: [{ row: 'AM-015', judgment, targets: [] }],
        },
        mergedFiles: [NO_SCREEN],
        ledger: ledger({ 'web.homepage': 'green' }),
        remediationCreatedAt: {},
      });
      expect(decision.action).toBe('hold');
      expect(decision.detail).toContain('AM-015');
    }
  );

  it.each([
    { uiEvidence: undefined },
    { uiEvidence: [] },
    { uiEvidence: [{ row: 'AM-015', judgment: 'taste' }] },
  ])(
    'holds current machine obligations despite missing or stale declarations: $uiEvidence',
    ({ uiEvidence }) => {
      const decision = decideScreenAuditReceipt({
        manifest: { ...OWED, uiEvidence },
        mergedFiles: SWITCH_PATHS,
        ledger: ledger({ 'web.homepage': 'green' }),
        remediationCreatedAt: {},
      });
      expect(decision.action).toBe('hold');
      expect(decision.detail).toContain('AM-015');
      expect(decision.detail).toContain('AM-021');
    }
  );

  it('does not erase declared machine evidence when that row is now taste-only', () => {
    expect(
      decideScreenAuditReceipt({
        manifest: {
          ...OWED,
          uiEvidence: [{ row: 'AM-024', judgment: 'mixed' }],
        },
        mergedFiles: [TASTE_PATH],
        ledger: ledger({}),
        remediationCreatedAt: {},
      }).action
    ).toBe('hold');
  });

  it('preserves unknown UI obligations after the lifecycle serializes its manifest', () => {
    const manifest = deriveValidationManifest({
      issue: { identifier: 'JOV-5582' },
      mergedPulls: [
        {
          number: 21808,
          url: 'https://github.com/JovieInc/Jovie/pull/21808',
          mergeSha: 'a'.repeat(40),
          mergedAt: '2026-10-23T22:00:00Z',
        },
      ],
      risk: {
        riskLevel: 'medium',
        blocksUnattendedAutoMerge: false,
        matchedRules: [],
      },
      uiEvidence: null,
    });
    expect(manifest).not.toHaveProperty('uiEvidence');
    expect(manifest.required.map(entry => entry.kind)).toEqual([
      'deployment',
      'screen-audit',
    ]);
    const unknownPath = 'apps/web/app/(marketing)/error.tsx';
    expect(changedScreenManifest([unknownPath])).toMatchObject({
      screens: [],
      unregistered: [unknownPath],
      requirements: [],
    });
    const decision = decideScreenAuditReceipt({
      manifest: JSON.parse(JSON.stringify(manifest)),
      mergedFiles: [unknownPath],
      ledger: ledger({ 'web.homepage': 'green' }),
      remediationCreatedAt: {},
    });
    expect(decision.action).toBe('hold');
    expect(decision.detail).toContain('unknown UI evidence');
  });

  it.each([
    { uiEvidence: null },
    { uiEvidence: 'unreadable' },
    { uiEvidence: [null] },
  ])(
    'holds explicitly unknown or malformed UI evidence: $uiEvidence',
    ({ uiEvidence }) => {
      expect(
        decideScreenAuditReceipt({
          manifest: { ...OWED, uiEvidence },
          mergedFiles: [NO_SCREEN],
          ledger: ledger({}),
          remediationCreatedAt: {},
        }).action
      ).toBe('hold');
    }
  );

  it.each([
    TASTE_PATH,
    'canon/invariants.jsonl',
    'packages/ui/atoms/switch.test.tsx',
  ])(
    'preserves no-screen behavior when neither declaration nor current paths owe machine evidence: %s',
    path => {
      expect(
        decideScreenAuditReceipt({
          manifest: {
            ...OWED,
            uiEvidence: [{ row: 'AM-024', judgment: 'taste' }],
          },
          mergedFiles: [path],
          ledger: ledger({}),
          remediationCreatedAt: {},
        }).action
      ).toBe('pass');
    }
  );
});

describe('latestManifest', () => {
  it('reads the newest lifecycle manifest and ignores malformed ones', () => {
    const block = json => `x\n<!-- validation-manifest:v1\n${json}\n-->`;
    const older = { ...OWED, issue: 'JOV-1', bindingSha: 'a'.repeat(40) };
    const newer = { ...OWED, issue: 'JOV-1', bindingSha: 'b'.repeat(40) };
    expect(
      latestManifest([
        {
          body: block(JSON.stringify(older)),
          createdAt: '2026-10-01T00:00:00Z',
        },
        { body: block('{broken'), createdAt: '2026-10-03T00:00:00Z' },
        {
          body: block(JSON.stringify(newer)),
          createdAt: '2026-10-02T00:00:00Z',
        },
      ])?.bindingSha
    ).toBe('b'.repeat(40));
    expect(
      latestManifest([
        { body: 'no manifest', createdAt: '2026-10-01T00:00:00Z' },
      ])
    ).toBeNull();
  });
});

describe('produceScreenAuditReceipts', () => {
  it('writes no receipt for the real Switch obligations when only unrelated screen evidence exists', async () => {
    const sha = 'a'.repeat(40);
    const pullUrl = 'https://github.com/JovieInc/Jovie/pull/21808';
    const manifest = deriveValidationManifest({
      issue: { identifier: 'JOV-5582' },
      mergedPulls: [
        {
          number: 21808,
          url: pullUrl,
          mergeSha: sha,
          mergedAt: '2026-10-23T22:00:00Z',
        },
      ],
      risk: {
        riskLevel: 'medium',
        blocksUnattendedAutoMerge: false,
        matchedRules: [],
      },
      uiEvidence: mergedUiEvidence(SWITCH_PATHS, readAssuranceMatrix()),
    });
    expect(manifest.required.map(entry => entry.kind)).toEqual([
      'deployment',
      'screen-audit',
    ]);
    expect(manifest.uiEvidence.map(entry => entry.row)).toEqual([
      'AM-015',
      'AM-021',
    ]);
    expect(changedScreenManifest(SWITCH_PATHS).screens).toEqual([]);
    const artifacts = mkdtempSync(join(tmpdir(), 'screen-receipt-switch-'));
    const writes = [];
    try {
      writeFileSync(
        join(artifacts, 'home.json'),
        JSON.stringify({ findings: [] })
      );
      writeFileSync(
        join(artifacts, 'receipt.json'),
        JSON.stringify({
          schemaVersion: 'jovie-route-dom-certification/v1',
          sourceGitSha: sha,
          receipts: [
            {
              route: '/',
              viewport: 'desktop',
              state: 'default',
              snapshotPath: 'home.json',
            },
          ],
        })
      );
      const inventory = auditScreens({
        ...loadArtifacts(artifacts),
        judge: null,
      });
      const tracked = inventory.screens
        .filter(screen => screen.verdict === 'red')
        .map(screen => ({
          createdAt: '2026-10-23T22:00:00Z',
          labels: {
            nodes: [{ name: `remediation:screen-audit:${screen.id}` }],
          },
        }));
      const result = await produceScreenAuditReceipts({
        artifacts,
        sha,
        screensSha: sha,
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
        log: () => {},
        github: {
          paginate: async endpoint => {
            expect(endpoint).toContain('/pulls/21808/files?per_page=100');
            return SWITCH_PATHS.map(filename => ({ filename }));
          },
        },
        linear: {
          graphql: async (query, variables) => {
            if (query.includes('mutation')) {
              writes.push(variables);
              return { commentCreate: { success: true } };
            }
            return {
              issues: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: query.includes('remediation:screen-audit:')
                  ? tracked
                  : [
                      {
                        id: 'switch-5582',
                        identifier: 'JOV-5582',
                        comments: {
                          nodes: [
                            {
                              createdAt: '2026-10-23T22:59:48Z',
                              body: `<!-- validation-manifest:v1\n${JSON.stringify(manifest)}\n-->`,
                            },
                          ],
                        },
                      },
                    ],
              },
            };
          },
        },
      });
      expect(result.results).toEqual([
        expect.objectContaining({ issue: 'JOV-5582', action: 'hold' }),
      ]);
      expect(writes).toEqual([]);
    } finally {
      rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('rejects a sha that is not a full commit', async () => {
    await expect(
      produceScreenAuditReceipts({
        artifacts: '/nonexistent',
        sha: 'abc',
        runUrl: 'https://example.invalid/run',
        linear: { graphql: async () => ({}) },
        github: {},
      })
    ).rejects.toThrow('--sha must be 40 hex');
  });
});

describe('rendersSameAs', () => {
  const github = compare => ({
    rest: async () => ({ json: async () => compare }),
  });
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  it('accepts the exact commit, or an ancestor with no render-root change', async () => {
    expect((await rendersSameAs(github({}), A, A)).same).toBe(true);
    expect(
      (
        await rendersSameAs(
          github({ status: 'ahead', files: [{ filename: 'scripts/x.mjs' }] }),
          A,
          B
        )
      ).same
    ).toBe(true);
  });
  it('rejects a render-root change, a diverged commit, or an unprovable diff', async () => {
    const changed = await rendersSameAs(
      github({
        status: 'ahead',
        files: [{ filename: 'apps/web/app/page.tsx' }],
      }),
      A,
      B
    );
    expect(changed).toMatchObject({ same: false });
    expect(changed.detail).toContain('1 render-root file');
    expect(
      (await rendersSameAs(github({ status: 'diverged', files: [] }), A, B))
        .same
    ).toBe(false);
    const many = Array.from({ length: 300 }, (_, i) => ({
      filename: `scripts/${i}.mjs`,
    }));
    expect(
      (await rendersSameAs(github({ status: 'ahead', files: many }), A, B)).same
    ).toBe(false);
  });
});
