/**
 * "Ready to submit" gate for marketplace listing packages (JOV-9759).
 *
 * A package is ready only when all four receipts hold:
 *   agentPathCert        harness receipt (agent-path-cert.json): ok=true, base=https://jov.ie,
 *                        younger than 24h, toolsListHash equals this package's tools/list hash.
 *   trustSurfaceVisual   trust-surface-visual.json (schema trust-surface-visual/v1): zero severe findings at
 *                        390 and 1440 for every trust route. Nothing in the repo emits severity or widths
 *                        yet: scripts/invariants/screen-audit.mjs takes a judge file of
 *                        { principle, finding, evidence } per screen. The critic should emit this schema.
 *   legalConsistency     computed here from the listing copy, the footer link registry, the legal page
 *                        sources and the legal text. No receipt file.
 *   homepageTasteApproval homepage-taste.json: { schema, cardId (Ovie Summer card id, sc_ + 32 hex), decision
 *                        approved | default_ship_after_deadline, decideBy }. File the card with
 *                        POST /api/internal/ovie/summer-cards { idempotencyKey, kind: "taste", product: "jov",
 *                        title, body, recommendation, defaultIfSilent, defaultDecision: "approve", decideBy }.
 *                        The card id is sc_ + the first 32 hex of sha256("summer-card:" + idempotencyKey).
 *
 * Time checks (24h freshness, a passed deadline) need a clock. The committed readiness.json is evaluated with
 * no clock so it stays reproducible; `agent-distribution:ready` re-evaluates with the real time.
 */
import type { Listing } from './listing';

export const PLATFORMS = ['muse', 'grok', 'chatgpt', 'claude'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const GATES = [
  'agentPathCert',
  'trustSurfaceVisual',
  'legalConsistency',
  'homepageTasteApproval',
] as const;
export type GateName = (typeof GATES)[number];

export const CERT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CERT_BASE = 'https://jov.ie';
export const TRUST_ROUTES = [
  '/',
  '/pricing',
  '/artist-profiles',
  '/smart-links',
  '/legal/privacy',
  '/legal/terms',
  '/support',
  'footer-nav',
] as const;
export const TRUST_WIDTHS = [390, 1440] as const;
const CARD_ID = /^sc_[0-9a-f]{32}$/u;

export interface GateResult {
  readonly status: 'pass' | 'fail' | 'missing';
  readonly receiptId: string | null;
  readonly reasons: readonly string[];
}

export interface ReceiptSet {
  readonly agentPathCert?: unknown;
  readonly trustSurfaceVisual?: unknown;
  readonly homepageTasteApproval?: unknown;
}

export interface LegalInputs {
  readonly footerSource: string;
  readonly routesSource: string;
  readonly privacyPageExists: boolean;
  readonly termsPageExists: boolean;
  readonly privacyText: string;
  readonly termsText: string;
}

const rec = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const missing = (): GateResult => ({
  status: 'missing',
  receiptId: null,
  reasons: ['no receipt'],
});
const result = (receiptId: string | null, reasons: string[]): GateResult => ({
  status: reasons.length ? 'fail' : 'pass',
  receiptId,
  reasons,
});

export function checkAgentPathCert(
  raw: unknown,
  toolsListHash: string,
  now: Date | null
): GateResult {
  const receipt = rec(raw);
  if (!receipt) return missing();
  const reasons: string[] = [];
  if (receipt.ok !== true) reasons.push('receipt ok is not true');
  if (
    typeof receipt.base !== 'string' ||
    !receipt.base.startsWith(`${CERT_BASE}/`)
  )
    reasons.push(`base is not ${CERT_BASE}`);
  if (receipt.toolsListHash !== toolsListHash)
    reasons.push('toolsListHash does not match this package');
  const at =
    typeof receipt.at === 'string' ? Date.parse(receipt.at) : Number.NaN;
  if (Number.isNaN(at)) reasons.push('receipt has no valid timestamp');
  else if (now && now.getTime() - at > CERT_MAX_AGE_MS)
    reasons.push('receipt is older than 24 hours');
  else if (now && at > now.getTime() + 60_000)
    reasons.push('receipt timestamp is in the future');
  return result(typeof receipt.run === 'string' ? receipt.run : null, reasons);
}

export function checkTrustSurfaceVisual(raw: unknown): GateResult {
  const receipt = rec(raw);
  if (!receipt) return missing();
  const reasons: string[] = [];
  if (receipt.schema !== 'trust-surface-visual/v1')
    reasons.push('schema is not trust-surface-visual/v1');
  const rows = Array.isArray(receipt.results) ? receipt.results.map(rec) : [];
  for (const route of TRUST_ROUTES)
    for (const width of TRUST_WIDTHS) {
      const row = rows.find(r => r?.route === route && r?.width === width);
      if (!row) {
        reasons.push(`no result for ${route} at ${width}`);
        continue;
      }
      const findings = Array.isArray(row.findings) ? row.findings.map(rec) : [];
      const severe = findings.filter(f => f?.severity === 'severe').length;
      if (severe)
        reasons.push(`${severe} severe finding(s) for ${route} at ${width}`);
    }
  return result(typeof receipt.id === 'string' ? receipt.id : null, reasons);
}

export function checkHomepageTaste(raw: unknown, now: Date | null): GateResult {
  const receipt = rec(raw);
  if (!receipt) return missing();
  const reasons: string[] = [];
  const cardId = typeof receipt.cardId === 'string' ? receipt.cardId : null;
  if (!cardId || !CARD_ID.test(cardId))
    reasons.push('cardId is not an Ovie card id');
  const decision = receipt.decision;
  if (decision !== 'approved' && decision !== 'default_ship_after_deadline')
    reasons.push('decision is not approved or default_ship_after_deadline');
  const deadline =
    typeof receipt.decideBy === 'string'
      ? Date.parse(receipt.decideBy)
      : Number.NaN;
  if (Number.isNaN(deadline)) reasons.push('decideBy is not a timestamp');
  else if (
    decision === 'default_ship_after_deadline' &&
    now &&
    deadline > now.getTime()
  )
    reasons.push('the card deadline has not passed');
  return result(cardId, reasons);
}

function footerHrefs(footerSource: string, routesSource: string): string[] {
  const names = [...footerSource.matchAll(/href:\s*APP_ROUTES\.(\w+)/gu)].map(
    m => m[1]
  );
  return names.flatMap(name => {
    const match = new RegExp(`\\b${name}:\\s*'([^']+)'`, 'u').exec(
      routesSource
    );
    return match?.[1] ? [match[1]] : [];
  });
}

/** What the connector declares, and the pattern the legal text must match to cover it. */
export function legalTopics(listing: Listing) {
  const days = listing.draftRetentionDays;
  return [
    {
      topic: 'data collected: public artist identity and release facts',
      covered: (t: string) =>
        /\bapple music\b/iu.test(t) &&
        /\brelease (facts|metadata|data|information|details)\b/iu.test(t),
    },
    {
      topic: 'anonymous write action: unpublished drafts',
      covered: (t: string) => /\bunpublished drafts?\b/iu.test(t),
    },
    {
      topic: 'data collected: acquisition attribution',
      covered: (t: string) => /\battribution\b/iu.test(t),
    },
    {
      topic: `retention: ${days}-day draft expiry`,
      covered: (t: string) =>
        new RegExp(
          `\\bdrafts?\\b[^.\\n]{0,120}\\b(seven|${days})[- ]days?\\b|\\b(seven|${days})[- ]days?\\b[^.\\n]{0,80}\\bdrafts?\\b`,
          'iu'
        ).test(t),
    },
    ...listing.assistants.map(name => ({
      topic: `named assistant: ${name}`,
      covered: (t: string) => new RegExp(`\\b${name}\\b`, 'iu').test(t),
    })),
  ];
}

/** Deterministic: runs against source files, never the network. */
export function checkLegalConsistency(
  legal: LegalInputs | null,
  listing: Listing
): GateResult {
  if (!legal) return missing();
  const reasons: string[] = [];
  if (!legal.privacyPageExists) reasons.push('/legal/privacy has no page');
  if (!legal.termsPageExists) reasons.push('/legal/terms has no page');
  const hrefs = footerHrefs(legal.footerSource, legal.routesSource);
  for (const path of ['/legal/privacy', '/legal/terms'])
    if (!hrefs.includes(path))
      reasons.push(`${path} is not linked from the footer`);
  const declared = `${listing.dataHandling} ${listing.longDescription}`;
  if (!/\bdraft/iu.test(declared) || !/\bacquisition\b/iu.test(declared))
    reasons.push(
      'listing data handling does not declare drafts and acquisition fields'
    );
  const text = `${legal.privacyText}\n${legal.termsText}`;
  for (const { topic, covered } of legalTopics(listing))
    if (!covered(text)) reasons.push(`legal text does not cover ${topic}`);
  return result('legal-source-check', reasons);
}

export interface PackageReadiness {
  readonly ready: boolean;
  readonly gates: Record<GateName, GateResult>;
  readonly missingReceipts: readonly GateName[];
}

export function evaluatePackage(input: {
  receipts: ReceiptSet;
  legal: LegalInputs | null;
  listing: Listing;
  toolsListHash: string;
  now: Date | null;
}): PackageReadiness {
  const gates: Record<GateName, GateResult> = {
    agentPathCert: checkAgentPathCert(
      input.receipts.agentPathCert,
      input.toolsListHash,
      input.now
    ),
    trustSurfaceVisual: checkTrustSurfaceVisual(
      input.receipts.trustSurfaceVisual
    ),
    legalConsistency: checkLegalConsistency(input.legal, input.listing),
    homepageTasteApproval: checkHomepageTaste(
      input.receipts.homepageTasteApproval,
      input.now
    ),
  };
  const failing = GATES.filter(g => gates[g].status !== 'pass');
  return { ready: failing.length === 0, gates, missingReceipts: failing };
}

export type ReadinessInputs = {
  readonly receipts: Record<Platform, ReceiptSet>;
  readonly legal: LegalInputs | null;
};

export function evaluateAll(
  inputs: ReadinessInputs,
  listing: Listing,
  toolsListHash: string,
  now: Date | null
): Record<Platform, PackageReadiness> {
  return Object.fromEntries(
    PLATFORMS.map(p => [
      p,
      evaluatePackage({
        receipts: inputs.receipts[p],
        legal: inputs.legal,
        listing,
        toolsListHash,
        now,
      }),
    ])
  ) as Record<Platform, PackageReadiness>;
}
