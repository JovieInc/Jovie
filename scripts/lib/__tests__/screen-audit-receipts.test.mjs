import { describe, expect, it } from 'vitest';
import {
  decideScreenAuditReceipt,
  latestManifest,
  produceScreenAuditReceipts,
  rendersSameAs,
} from '../screen-audit-receipts.mjs';

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
