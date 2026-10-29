/**
 * Per-profile certification: the waitlist gate (Tim, 2026-10-29).
 *
 * The golden-path certification proves the generic journey. This proves one
 * real person's profile before they are let in: the matched artist is the one
 * they chose, their real releases are imported, the page has a name and photo,
 * smart links resolve, there is no placeholder data and the entitlement state
 * is sane. Pure: the server module gathers the facts and persists the receipt.
 *
 * Verdicts:
 *   - passed: every required check passed; the entry may be invited.
 *   - failed: something machine-fixable or code-fixable is wrong; remediation
 *     is dispatched and the profile re-certifies on the fix event.
 *   - needs_artist_confirmation: the artist match is missing, ambiguous or
 *     contradicts the person's own choice. Never auto-approved; the person
 *     confirms their artist in product.
 */

export const PROFILE_CERT_RECEIPT_SCHEMA =
  'jovie.waitlist-profile-cert-receipt/v1' as const;
export const PROFILE_CERT_LEDGER_CONTRACT =
  'jovie.waitlist-profile-cert-ledger/v1' as const;
export const PROFILE_CERT_LEDGER_KEY =
  'jovie:certification:v1:waitlist-profiles' as const;

export const PROFILE_CERT_TRIGGERS = [
  'claim',
  'waitlist_entry',
  'waitlist_approval',
  'catalog_import',
  'auto_accept',
  'manual',
] as const;
export type ProfileCertTrigger = (typeof PROFILE_CERT_TRIGGERS)[number];

export const PROFILE_CERT_STATUSES = [
  'passed',
  'failed',
  'needs_artist_confirmation',
] as const;
export type ProfileCertStatus = (typeof PROFILE_CERT_STATUSES)[number];

export const PROFILE_CERT_CHECK_IDS = [
  'artist_match',
  'releases_present',
  'identity_name_avatar',
  'smart_links',
  'public_page',
  'no_placeholder_data',
  'entitlement_sane',
] as const;
export type ProfileCertCheckId = (typeof PROFILE_CERT_CHECK_IDS)[number];

export type ProfileCertCheckStatus = 'passed' | 'failed' | 'skipped';

export interface ProfileCertCheck {
  readonly id: ProfileCertCheckId;
  readonly status: ProfileCertCheckStatus;
  readonly summary: string;
}

/** Remediation the server dispatches immediately for a failed check. */
export type ProfileCertRemediation =
  | 'import_catalog'
  | 'ask_artist_confirmation'
  | 'operator_card';

/** Video and screenshots of the agent walking this profile's path. */
export interface ProfileCertEvidence {
  readonly videoUrl: string | null;
  readonly screenshots: readonly {
    readonly step: string;
    readonly url: string;
    readonly verdict: 'pass' | 'fail';
  }[];
}

export interface ProfileCertReceipt {
  readonly schema: typeof PROFILE_CERT_RECEIPT_SCHEMA;
  readonly profileId: string;
  readonly waitlistEntryId: string | null;
  readonly status: ProfileCertStatus;
  /** Exact deployed commit the facts were read on. */
  readonly sha: string | null;
  readonly trigger: ProfileCertTrigger;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly checks: readonly ProfileCertCheck[];
  readonly remediation: readonly ProfileCertRemediation[];
  readonly evidence: ProfileCertEvidence | null;
}

/** Facts read from production for one profile. No email or other PII. */
export interface ProfileCertFacts {
  readonly profileId: string;
  readonly waitlistEntryId: string | null;
  readonly displayName: string | null;
  readonly username: string | null;
  readonly avatarUrl: string | null;
  readonly spotifyId: string | null;
  /** Artist the person picked themselves in onboarding, if any. */
  readonly selectedSpotifyArtistId: string | null;
  readonly selectedSpotifyArtistName: string | null;
  /** The name the person gave us (waitlist entry, account). */
  readonly personName: string | null;
  readonly isPublic: boolean;
  readonly releases: readonly {
    readonly title: string | null;
    readonly slug: string | null;
    readonly hasArtwork: boolean;
    readonly smartLinkTargets: number;
  }[];
  readonly entitlement: {
    readonly plan: string | null;
    readonly isPro: boolean;
    readonly hasStripeSubscription: boolean;
    readonly trialEndsAt: string | null;
  };
  /** Public page probe; null when not probed (page not public yet). */
  readonly publicPage: {
    readonly status: number;
    readonly errorMarkers: readonly string[];
  } | null;
  /** Smart link probes of public release pages; empty when not probed. */
  readonly smartLinkProbes: readonly { readonly status: number }[];
  /**
   * Evidence-scored artist identity from the music resolver
   * (`getArtistIdentityConfidence`, #23732). When present it decides the
   * artist check; the owner-pick comparison is only the fallback.
   */
  readonly identity?: {
    readonly decision:
      | 'certified'
      | 'needs_confirmation'
      | 'conflict'
      | 'unbound';
    readonly score: number;
    readonly threshold: number;
  } | null;
}

const KNOWN_PLANS = new Set(['free', 'pro', 'growth', 'max', 'founding']);

const PLACEHOLDER_NAME =
  /^(artist|your name|test|demo|sample|placeholder|untitled|new artist|lorem ipsum|unknown artist)$/iu;
const PLACEHOLDER_HANDLE =
  /^(user|artist|demo|test|sample)[-_]?[a-z0-9]{0,12}$/iu;
const PLACEHOLDER_TITLE =
  /^(demo|sample|untitled|placeholder|test release)\b/iu;
const PLACEHOLDER_AVATAR =
  /(placeholder|default[-_]avatar|ui-avatars|gravatar\.com\/avatar\/0)/iu;

export function normalizeArtistName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function check(
  id: ProfileCertCheckId,
  status: ProfileCertCheckStatus,
  summary: string
): ProfileCertCheck {
  return { id, status, summary };
}

export function checkArtistMatch(facts: ProfileCertFacts): ProfileCertCheck {
  if (!facts.spotifyId) {
    return check('artist_match', 'failed', 'No artist matched yet.');
  }
  if (
    facts.selectedSpotifyArtistId &&
    facts.selectedSpotifyArtistId !== facts.spotifyId
  ) {
    return check(
      'artist_match',
      'failed',
      'Matched artist differs from the one the person picked.'
    );
  }
  // Admission bar (Tim, 2026-10-29): resolver identity confidence at or
  // above the threshold, or owner confirmation (which the resolver scores).
  // An owner pick alone is evidence, not certification; no identity read
  // fails closed.
  if (!facts.identity) {
    return check(
      'artist_match',
      'failed',
      'Artist identity not scored by the resolver yet; an owner pick alone is below the bar.'
    );
  }
  const { decision, score, threshold } = facts.identity;
  return decision === 'certified'
    ? check(
        'artist_match',
        'passed',
        `Artist identity certified by evidence (${score} >= ${threshold}).`
      )
    : check(
        'artist_match',
        'failed',
        `Artist identity ${decision.replaceAll('_', ' ')} (${score} < ${threshold}); the owner confirms in product.`
      );
}

export function checkReleases(facts: ProfileCertFacts): ProfileCertCheck {
  if (facts.releases.length === 0) {
    return check('releases_present', 'failed', 'No releases imported.');
  }
  const untitled = facts.releases.filter(r => !r.title?.trim()).length;
  if (untitled > 0) {
    return check(
      'releases_present',
      'failed',
      `${untitled} of ${facts.releases.length} releases have no title.`
    );
  }
  return check(
    'releases_present',
    'passed',
    `${facts.releases.length} releases imported.`
  );
}

export function checkIdentity(facts: ProfileCertFacts): ProfileCertCheck {
  const missing = [
    facts.displayName?.trim() ? null : 'name',
    facts.username?.trim() ? null : 'handle',
    facts.avatarUrl?.trim() ? null : 'photo',
  ].filter((m): m is string => m !== null);
  return missing.length === 0
    ? check('identity_name_avatar', 'passed', 'Name, handle and photo set.')
    : check('identity_name_avatar', 'failed', `Missing ${missing.join(', ')}.`);
}

export function checkSmartLinks(facts: ProfileCertFacts): ProfileCertCheck {
  if (facts.releases.length === 0) {
    return check('smart_links', 'failed', 'No releases, so no smart links.');
  }
  const unlinked = facts.releases.filter(
    r => !r.slug || r.smartLinkTargets === 0
  ).length;
  if (unlinked > 0) {
    return check(
      'smart_links',
      'failed',
      `${unlinked} of ${facts.releases.length} releases have no smart link destination.`
    );
  }
  const broken = facts.smartLinkProbes.filter(
    p => p.status < 200 || p.status >= 400
  ).length;
  if (broken > 0) {
    return check(
      'smart_links',
      'failed',
      `${broken} smart link pages did not load.`
    );
  }
  return check(
    'smart_links',
    'passed',
    facts.smartLinkProbes.length > 0
      ? `Every release has destinations; ${facts.smartLinkProbes.length} pages loaded.`
      : 'Every release has a smart link destination.'
  );
}

export function checkPublicPage(facts: ProfileCertFacts): ProfileCertCheck {
  if (!facts.publicPage) {
    return check(
      'public_page',
      'skipped',
      facts.isPublic
        ? 'Public page was not probed.'
        : 'Page is private until the person finishes onboarding.'
    );
  }
  if (facts.publicPage.status !== 200) {
    return check(
      'public_page',
      'failed',
      `Public page returned HTTP ${facts.publicPage.status}.`
    );
  }
  if (facts.publicPage.errorMarkers.length > 0) {
    return check(
      'public_page',
      'failed',
      `Public page shows errors: ${facts.publicPage.errorMarkers.join(', ')}.`
    );
  }
  return check('public_page', 'passed', 'Public page renders.');
}

export function checkPlaceholders(facts: ProfileCertFacts): ProfileCertCheck {
  const found: string[] = [];
  if (facts.displayName && PLACEHOLDER_NAME.test(facts.displayName.trim()))
    found.push('name');
  if (facts.username && PLACEHOLDER_HANDLE.test(facts.username.trim()))
    found.push('handle');
  if (facts.avatarUrl && PLACEHOLDER_AVATAR.test(facts.avatarUrl))
    found.push('photo');
  if (facts.releases.some(r => r.title && PLACEHOLDER_TITLE.test(r.title)))
    found.push('release title');
  return found.length === 0
    ? check('no_placeholder_data', 'passed', 'No stand-in or demo data.')
    : check(
        'no_placeholder_data',
        'failed',
        `Stand-in data in ${found.join(', ')}.`
      );
}

export function checkEntitlement(facts: ProfileCertFacts): ProfileCertCheck {
  const { plan, isPro, hasStripeSubscription } = facts.entitlement;
  if (plan && !KNOWN_PLANS.has(plan)) {
    return check('entitlement_sane', 'failed', `Unknown plan "${plan}".`);
  }
  if (isPro && !hasStripeSubscription && !facts.entitlement.trialEndsAt) {
    return check(
      'entitlement_sane',
      'failed',
      'Marked paid with no subscription or trial.'
    );
  }
  return check(
    'entitlement_sane',
    'passed',
    `Plan ${plan ?? 'free'}; nothing charged before value.`
  );
}

export function evaluateProfileCertification(
  facts: ProfileCertFacts
): Pick<ProfileCertReceipt, 'status' | 'checks' | 'remediation'> {
  const checks = [
    checkArtistMatch(facts),
    checkReleases(facts),
    checkIdentity(facts),
    checkSmartLinks(facts),
    checkPublicPage(facts),
    checkPlaceholders(facts),
    checkEntitlement(facts),
  ];
  const failed = new Set(
    checks.filter(c => c.status === 'failed').map(c => c.id)
  );
  if (failed.has('artist_match')) {
    // Releases and links follow the artist: importing an unconfirmed
    // artist's catalog would only make the wrong profile look finished.
    return {
      status: 'needs_artist_confirmation',
      checks,
      remediation: ['ask_artist_confirmation'],
    };
  }
  if (failed.size === 0) return { status: 'passed', checks, remediation: [] };

  const remediation: ProfileCertRemediation[] = [];
  const catalogFixable =
    facts.spotifyId !== null &&
    (failed.has('releases_present') ||
      failed.has('smart_links') ||
      failed.has('identity_name_avatar'));
  if (catalogFixable) remediation.push('import_catalog');
  const other = [...failed].filter(
    id =>
      !catalogFixable ||
      !['releases_present', 'smart_links', 'identity_name_avatar'].includes(id)
  );
  if (other.length > 0) remediation.push('operator_card');
  return { status: 'failed', checks, remediation };
}

/** Auto-accept may invite only a passed receipt on a certified profile. */
export function isProfileCertifiedForInvite(
  receipt: Pick<ProfileCertReceipt, 'status'> | null | undefined
): boolean {
  return receipt?.status === 'passed';
}

// ---------------------------------------------------------------------------
// Ledger: one record per profile, latest receipt plus a short history.
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 20;

export interface ProfileCertRecord {
  readonly latest: ProfileCertReceipt;
  readonly firstPassedAt: string | null;
  readonly lastPassedSha: string | null;
  readonly history: readonly {
    readonly status: ProfileCertStatus;
    readonly sha: string | null;
    readonly trigger: ProfileCertTrigger;
    readonly endedAt: string;
  }[];
}

export interface ProfileCertLedger {
  readonly schemaVersion: 1;
  readonly contract: typeof PROFILE_CERT_LEDGER_CONTRACT;
  readonly profiles: Readonly<Record<string, ProfileCertRecord>>;
  readonly updatedAt: string;
}

export class ProfileCertPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileCertPersistenceError';
  }
}

export function emptyProfileCertLedger(updatedAt: string): ProfileCertLedger {
  return {
    schemaVersion: 1,
    contract: PROFILE_CERT_LEDGER_CONTRACT,
    profiles: {},
    updatedAt,
  };
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isProfileCertReceipt(
  value: unknown
): value is ProfileCertReceipt {
  if (!isRecordObject(value)) return false;
  if (value.schema !== PROFILE_CERT_RECEIPT_SCHEMA) return false;
  if (typeof value.profileId !== 'string' || !value.profileId) return false;
  if (!(PROFILE_CERT_STATUSES as readonly unknown[]).includes(value.status))
    return false;
  if (!Array.isArray(value.checks) || value.checks.length === 0) return false;
  if (
    value.status === 'passed' &&
    value.checks.some(c => isRecordObject(c) && c.status === 'failed')
  )
    return false;
  return (
    typeof value.endedAt === 'string' &&
    !Number.isNaN(Date.parse(value.endedAt))
  );
}

export function parseProfileCertLedger(raw: unknown): ProfileCertLedger {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ProfileCertPersistenceError(
        'Profile certification ledger is not valid JSON.'
      );
    }
  }
  if (
    !isRecordObject(value) ||
    value.schemaVersion !== 1 ||
    value.contract !== PROFILE_CERT_LEDGER_CONTRACT ||
    !isRecordObject(value.profiles)
  ) {
    throw new ProfileCertPersistenceError(
      'Profile certification ledger has an unexpected shape.'
    );
  }
  for (const [id, record] of Object.entries(value.profiles)) {
    if (
      !isRecordObject(record) ||
      !isProfileCertReceipt(record.latest) ||
      record.latest.profileId !== id
    ) {
      throw new ProfileCertPersistenceError(
        `Profile certification record ${id} is invalid.`
      );
    }
  }
  return value as unknown as ProfileCertLedger;
}

/** Pure ledger update; an older receipt never overwrites a newer verdict. */
export function applyProfileCertReceipt(
  ledger: ProfileCertLedger,
  receipt: ProfileCertReceipt,
  recordedAt: string
): { readonly ledger: ProfileCertLedger; readonly recorded: boolean } {
  const existing = ledger.profiles[receipt.profileId];
  if (
    existing &&
    Date.parse(receipt.endedAt) <= Date.parse(existing.latest.endedAt)
  ) {
    return { ledger, recorded: false };
  }
  const passed = receipt.status === 'passed';
  const record: ProfileCertRecord = {
    latest: receipt,
    firstPassedAt: existing?.firstPassedAt ?? (passed ? receipt.endedAt : null),
    lastPassedSha: passed ? receipt.sha : (existing?.lastPassedSha ?? null),
    history: [
      ...(existing?.history ?? []),
      {
        status: receipt.status,
        sha: receipt.sha,
        trigger: receipt.trigger,
        endedAt: receipt.endedAt,
      },
    ].slice(-HISTORY_LIMIT),
  };
  return {
    ledger: {
      ...ledger,
      profiles: { ...ledger.profiles, [receipt.profileId]: record },
      updatedAt: recordedAt,
    },
    recorded: true,
  };
}
