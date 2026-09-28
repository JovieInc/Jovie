import type { AnswerReusePack } from '@/lib/investors/answer-reuse';
import { validateAnswerReusePack } from '@/lib/investors/answer-reuse';

/**
 * Public editorial retargeting adapter (JOV-6289).
 *
 * Registers explicitly approved public answer-article routes for Jovie's
 * existing permissioned retargeting loop (JOV-6222 rails). This module only
 * decides WHICH canonical paths are eligible and WHICH non-sensitive fields
 * may be emitted. It creates no campaign, audience, spend, or account charge —
 * a separately approved pilot governs all of that.
 */

export interface EditorialRetargetingEntry {
  /** Stable canonical path, e.g. `/blog/one-profile-for-your-work`. */
  readonly canonicalPath: string;
  readonly derivativeId: string;
  readonly contentRevision: string;
}

export type EditorialRetargetingState =
  | 'eligible'
  | 'suppressed-unregistered-route'
  | 'suppressed-sensitive-query'
  | 'suppressed-no-consent'
  | 'suppressed-demo-recording'
  | 'suppressed-passive-runtime'
  | 'suppressed-unconfigured';

/**
 * Query parameters that can carry investor identities, access tokens, or
 * private objections. Their presence suppresses retargeting entirely so a
 * shared link with sensitive context never enters an ad audience.
 */
const SENSITIVE_QUERY_PARAM =
  /^(?:token|access[_-]?token|auth|code|session|email|e|name|investor|objection|ref|referrer|utm_[a-z]+|gclid|fbclid|ttclid|dclid|msclkid|twclid|li_fat_id|sig|signature|key|preview|draft)$/iu;

/**
 * The only fields an editorial retargeting event may carry. Investor names,
 * emails, tokens, financial details, document titles, full URLs, and referrers
 * are structurally excluded — there is no field that could carry them.
 */
export interface EditorialRetargetingEventFields {
  readonly content_path: string;
  readonly content_revision: string;
  readonly derivative_id: string;
}

export const EDITORIAL_RETARGETING_EVENT = 'EditorialArticleView' as const;

/**
 * A derivative joins the retargeting registry only when every applicable
 * approval exists: public disclosure, approved copy, published release,
 * public-publishing distribution approval, and an explicit paid-promotion
 * approval (the retargeting scope). Draft or internal derivatives — including
 * investor-deck slides and recruiting narratives — are never eligible.
 */
export function buildEditorialRetargetingRegistry(
  pack: AnswerReusePack
): readonly EditorialRetargetingEntry[] {
  const issues = validateAnswerReusePack(pack);
  const sourceBlocked = issues.some(candidate => !candidate.derivativeId);
  const blockedDerivativeIds = new Set(
    issues.map(candidate => candidate.derivativeId).filter(Boolean)
  );

  return pack.derivatives.flatMap(derivative => {
    if (sourceBlocked || blockedDerivativeIds.has(derivative.derivativeId)) {
      return [];
    }
    if (
      derivative.disclosure !== 'public' ||
      derivative.channel !== 'customer-editorial' ||
      derivative.review.state !== 'approved' ||
      derivative.releaseState !== 'published' ||
      derivative.distribution.publicPublishing.state !== 'approved' ||
      derivative.distribution.paidPromotion.state !== 'approved' ||
      !derivative.canonicalPath
    ) {
      return [];
    }
    return [
      {
        canonicalPath: derivative.canonicalPath,
        derivativeId: derivative.derivativeId,
        contentRevision: derivative.contentRevision,
      },
    ];
  });
}

/**
 * Exact-match lookup. Sub-paths, prefixes, and lookalike routes do not
 * inherit eligibility; unregistered public pages get nothing.
 */
export function findEditorialRetargetingEntry(
  pathname: string | null,
  registry: readonly EditorialRetargetingEntry[]
): EditorialRetargetingEntry | undefined {
  if (!pathname) return undefined;
  return registry.find(entry => entry.canonicalPath === pathname);
}

/**
 * True when the current URL's query string carries a parameter that could
 * contain sensitive investor context. Checked against the live
 * `window.location.search`, not the rendered path.
 */
export function hasSensitiveQueryParams(search: string | null): boolean {
  if (!search || search === '?') return false;
  const params = new URLSearchParams(search);
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_PARAM.test(key)) return true;
  }
  return false;
}

/** Canonical non-sensitive event payload. Nothing else is emitted. */
export function buildEditorialRetargetingEventFields(
  entry: EditorialRetargetingEntry
): EditorialRetargetingEventFields {
  return {
    content_path: entry.canonicalPath,
    content_revision: entry.contentRevision,
    derivative_id: entry.derivativeId,
  };
}

export function resolveEditorialRetargetingState({
  hasPixelId,
  isPassive,
  entry,
  hasSensitiveQuery,
  isDemo,
  hasMarketingConsent,
}: {
  readonly hasPixelId: boolean;
  readonly isPassive: boolean;
  readonly entry: EditorialRetargetingEntry | undefined;
  readonly hasSensitiveQuery: boolean;
  readonly isDemo: boolean;
  readonly hasMarketingConsent: boolean;
}): EditorialRetargetingState {
  if (!hasPixelId) return 'suppressed-unconfigured';
  if (isPassive) return 'suppressed-passive-runtime';
  if (!entry) return 'suppressed-unregistered-route';
  if (hasSensitiveQuery) return 'suppressed-sensitive-query';
  if (isDemo) return 'suppressed-demo-recording';
  if (!hasMarketingConsent) return 'suppressed-no-consent';
  return 'eligible';
}
