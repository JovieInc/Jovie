import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LISTING } from './listing';
import {
  CERT_MAX_AGE_MS,
  evaluatePackage,
  type LegalInputs,
  namedAsCaller,
  TRUST_ROUTES,
  TRUST_WIDTHS,
} from './readiness';
import { readReadinessInputs } from './readiness-io';

const HASH = 'a'.repeat(64);
const NOW = new Date('2026-10-29T12:00:00Z');
const iso = (offsetMs: number) =>
  new Date(NOW.getTime() + offsetMs).toISOString();

const cert = (over: Record<string, unknown> = {}) => ({
  run: 'cert-1',
  ok: true,
  base: 'https://jov.ie/api/mcp',
  at: iso(-60_000),
  toolsListHash: HASH,
  ...over,
});
const visual = (severeAt?: [string, number]) => ({
  schema: 'trust-surface-visual/v1',
  id: 'vis-1',
  results: TRUST_ROUTES.flatMap(route =>
    TRUST_WIDTHS.map(width => ({
      route,
      width,
      findings:
        severeAt?.[0] === route && severeAt[1] === width
          ? [{ severity: 'severe', finding: 'overlap' }]
          : [{ severity: 'minor', finding: 'spacing' }],
    }))
  ),
});
const taste = (over: Record<string, unknown> = {}) => ({
  cardId: `sc_${'b'.repeat(32)}`,
  decision: 'approved',
  decideBy: iso(-1000),
  ...over,
});

const legalText = [
  'We read public artist identity from Spotify and Apple Music, plus release facts.',
  'Connected assistants such as ChatGPT, Claude, Grok and Muse can create unpublished drafts.',
  'We keep acquisition attribution. A draft expires after seven days.',
].join('\n');
const legalOk: LegalInputs = {
  footerSource: 'href: APP_ROUTES.LEGAL_PRIVACY, href: APP_ROUTES.LEGAL_TERMS',
  routesSource: "LEGAL_PRIVACY: '/legal/privacy', LEGAL_TERMS: '/legal/terms',",
  privacyPageExists: true,
  termsPageExists: true,
  privacyText: legalText,
  termsText: '',
};

const evaluate = (
  receipts: Parameters<typeof evaluatePackage>[0]['receipts'],
  legal: LegalInputs | null = legalOk,
  now: Date | null = NOW
) =>
  evaluatePackage({
    receipts,
    legal,
    listing: LISTING,
    toolsListHash: HASH,
    now,
  });
const allPass = {
  agentPathCert: cert(),
  trustSurfaceVisual: visual(),
  homepageTasteApproval: taste(),
};

describe('named assistants', () => {
  it('does not count a processor mention as a connector caller', () => {
    const processor =
      'We use Anthropic (Claude) for chat assistance in your dashboard.';
    expect(namedAsCaller(processor, 'Claude')).toBe(false);
    expect(
      namedAsCaller('AI assistants that call Jovie include Claude.', 'Claude')
    ).toBe(true);
    expect(
      namedAsCaller(`Claude ${'x'.repeat(400)} connected assistants`, 'Claude')
    ).toBe(false);
  });
});

describe('listing readiness gate', () => {
  it('is not ready when every receipt is missing', () => {
    const out = evaluate({}, null);
    expect(out.ready).toBe(false);
    expect(out.missingReceipts).toEqual([
      'agentPathCert',
      'trustSurfaceVisual',
      'legalConsistency',
      'homepageTasteApproval',
    ]);
    expect(out.gates.agentPathCert.status).toBe('missing');
  });

  it('is ready when all four gates pass', () => {
    const out = evaluate(allPass);
    expect(out.missingReceipts).toEqual([]);
    expect(out.ready).toBe(true);
    expect(out.gates.homepageTasteApproval.receiptId).toBe(
      `sc_${'b'.repeat(32)}`
    );
  });

  it('fails a stale cert, a wrong hash, a failed run and the wrong base', () => {
    const reasons = (c: unknown) =>
      evaluate({
        ...allPass,
        agentPathCert: c,
      }).gates.agentPathCert.reasons.join(';');
    expect(reasons(cert({ at: iso(-CERT_MAX_AGE_MS - 1000) }))).toContain(
      'older than 24 hours'
    );
    expect(reasons(cert({ toolsListHash: 'b'.repeat(64) }))).toContain(
      'toolsListHash'
    );
    expect(reasons(cert({ ok: false }))).toContain('ok is not true');
    expect(reasons(cert({ base: 'https://staging.jov.ie/api/mcp' }))).toContain(
      'base is not'
    );
  });

  it('defers time checks when no clock is given', () => {
    const out = evaluate(
      { ...allPass, agentPathCert: cert({ at: iso(-CERT_MAX_AGE_MS * 5) }) },
      legalOk,
      null
    );
    expect(out.gates.agentPathCert.status).toBe('pass');
  });

  it('fails the visual gate on a severe finding at one width or a missing route', () => {
    const severe = evaluate({
      ...allPass,
      trustSurfaceVisual: visual(['/pricing', 390]),
    });
    expect(severe.gates.trustSurfaceVisual.reasons).toEqual([
      '1 severe finding(s) for /pricing at 390',
    ]);
    const partial = { ...visual(), results: visual().results.slice(2) };
    const out = evaluate({ ...allPass, trustSurfaceVisual: partial });
    expect(out.gates.trustSurfaceVisual.reasons.join(';')).toContain(
      'no result for / at 390'
    );
    expect(
      evaluate({ ...allPass, trustSurfaceVisual: { ...visual(), schema: 'x' } })
        .gates.trustSurfaceVisual.status
    ).toBe('fail');
  });

  it('fails the taste gate on a bad id, decision or an unpassed default deadline', () => {
    const gate = (t: unknown) =>
      evaluate({ ...allPass, homepageTasteApproval: t }).gates
        .homepageTasteApproval;
    expect(gate(taste({ cardId: 'card-1' })).reasons.join()).toContain(
      'cardId'
    );
    expect(gate(taste({ decision: 'rejected' })).reasons.join()).toContain(
      'decision'
    );
    const early = gate(
      taste({ decision: 'default_ship_after_deadline', decideBy: iso(60_000) })
    );
    expect(early.reasons).toEqual(['the card deadline has not passed']);
    expect(
      gate(taste({ decision: 'default_ship_after_deadline' })).status
    ).toBe('pass');
  });

  it('lists every legal mismatch and footer or page gap', () => {
    const out = evaluate(allPass, {
      ...legalOk,
      footerSource: 'href: APP_ROUTES.LEGAL_PRIVACY',
      termsPageExists: false,
      privacyText: 'We use Anthropic Claude for chat.',
    });
    const reasons = out.gates.legalConsistency.reasons.join('\n');
    expect(out.ready).toBe(false);
    expect(reasons).toContain('/legal/terms has no page');
    expect(reasons).toContain('/legal/terms is not linked from the footer');
    expect(reasons).toContain('unpublished drafts');
    expect(reasons).toContain('7-day draft expiry');
    expect(reasons).toContain('named assistant as a connector caller: ChatGPT');
    expect(reasons).toContain('named assistant as a connector caller: Claude');
  });

  it('reads receipts and legal sources from disk', async () => {
    const web = await mkdtemp(join(tmpdir(), 'ready-'));
    try {
      const dir = join(web, 'lib/agent-distribution/receipts/muse');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'agent-path-cert.json'),
        JSON.stringify(cert())
      );
      await writeFile(join(dir, 'homepage-taste.json'), '{not json');
      const inputs = await readReadinessInputs(web);
      expect(inputs.receipts.muse.agentPathCert).toMatchObject({
        run: 'cert-1',
      });
      expect(inputs.receipts.grok.agentPathCert).toBeUndefined();
      expect(
        evaluate(inputs.receipts.muse, inputs.legal).gates.homepageTasteApproval
          .status
      ).toBe('fail');
      expect(inputs.legal?.privacyPageExists).toBe(false);
    } finally {
      await rm(web, { recursive: true, force: true });
    }
  });
});
