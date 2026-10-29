/**
 * Presence closed loop: one data model for the creator (Jovie) and company
 * (Ovie) sides. Pure functions only: callers supply observations from the
 * existing profile-surfaces / profile-search tables and fetch checks.
 *
 * Statuses answer "is this profile right?"; every issue maps to exactly one
 * fix proposal that needs user approval before any agent acts. Nothing here
 * posts or contacts anyone.
 */

export type PresenceMode = 'personal' | 'company';

export type PresenceHealthStatus =
  | 'verified'
  | 'out_of_date'
  | 'broken_link'
  | 'inconsistent'
  | 'missing';

export type PresenceIssueKind =
  | 'missing_profile'
  | 'broken_link'
  | 'stale_check'
  | 'handle_mismatch'
  | 'bio_mismatch'
  | 'photo_mismatch'
  | 'no_link_back_to_jovie'
  | 'jovie_does_not_link_out';

export interface CanonicalIdentity {
  readonly handle: string;
  readonly bio: string;
  /** Stable hash of the canonical photo; compared, never displayed. */
  readonly photoHash: string;
}

export interface ProfileObservation {
  readonly platform: string;
  readonly url: string;
  /** The user (or company) owns this profile, per qualification. */
  readonly qualified: boolean;
  readonly httpStatus: number | null;
  readonly handle: string | null;
  readonly bio: string | null;
  readonly photoHash: string | null;
  /** This profile's bio/links point at the Jovie page. */
  readonly linksBackToJovie: boolean;
  /** The Jovie page links out to this profile. */
  readonly jovieLinksOut: boolean;
  readonly lastCheckedAt: Date | null;
}

export interface PresenceIssue {
  readonly kind: PresenceIssueKind;
  readonly platform: string;
  readonly severity: 'high' | 'medium' | 'low';
}

export interface PresenceRow {
  readonly platform: string;
  readonly url: string | null;
  readonly status: PresenceHealthStatus;
  readonly issues: readonly PresenceIssue[];
}

export const STALE_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/^@/, '');
}

function normBio(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Status precedence: the most actionable problem wins the row badge. */
const STATUS_ORDER: readonly PresenceHealthStatus[] = [
  'missing',
  'broken_link',
  'inconsistent',
  'out_of_date',
  'verified',
];

export function classifyProfile(
  obs: ProfileObservation,
  canonical: CanonicalIdentity,
  now: Date
): PresenceRow {
  const issues: PresenceIssue[] = [];
  const broken =
    obs.httpStatus !== null &&
    (obs.httpStatus === 404 || obs.httpStatus >= 410);
  if (broken) {
    issues.push({
      kind: 'broken_link',
      platform: obs.platform,
      severity: 'high',
    });
  } else {
    if (obs.handle !== null && norm(obs.handle) !== norm(canonical.handle)) {
      issues.push({
        kind: 'handle_mismatch',
        platform: obs.platform,
        severity: 'medium',
      });
    }
    if (obs.bio !== null && normBio(obs.bio) !== normBio(canonical.bio)) {
      issues.push({
        kind: 'bio_mismatch',
        platform: obs.platform,
        severity: 'medium',
      });
    }
    if (obs.photoHash !== null && obs.photoHash !== canonical.photoHash) {
      issues.push({
        kind: 'photo_mismatch',
        platform: obs.platform,
        severity: 'low',
      });
    }
    const stale =
      obs.lastCheckedAt === null ||
      now.getTime() - obs.lastCheckedAt.getTime() > STALE_AFTER_DAYS * DAY_MS;
    if (stale) {
      issues.push({
        kind: 'stale_check',
        platform: obs.platform,
        severity: 'low',
      });
    }
  }
  if (!obs.linksBackToJovie) {
    issues.push({
      kind: 'no_link_back_to_jovie',
      platform: obs.platform,
      severity: 'medium',
    });
  }
  if (!obs.jovieLinksOut) {
    issues.push({
      kind: 'jovie_does_not_link_out',
      platform: obs.platform,
      severity: 'low',
    });
  }

  const kinds = new Set(issues.map(i => i.kind));
  let status: PresenceHealthStatus = 'verified';
  if (kinds.has('broken_link')) status = 'broken_link';
  else if (
    kinds.has('handle_mismatch') ||
    kinds.has('bio_mismatch') ||
    kinds.has('photo_mismatch')
  )
    status = 'inconsistent';
  else if (kinds.has('stale_check')) status = 'out_of_date';
  // Link-web gaps alone leave the profile itself correct but not "verified":
  // a profile is verified only when the loop is closed in both directions.
  else if (kinds.size > 0) status = 'out_of_date';

  return { platform: obs.platform, url: obs.url, status, issues };
}

export function buildPresenceRows(input: {
  readonly observations: readonly ProfileObservation[];
  readonly expectedPlatforms: readonly string[];
  readonly canonical: CanonicalIdentity;
  readonly now: Date;
}): PresenceRow[] {
  const owned = input.observations.filter(o => o.qualified);
  const have = new Set(owned.map(o => o.platform));
  const rows = owned.map(o => classifyProfile(o, input.canonical, input.now));
  for (const platform of input.expectedPlatforms) {
    if (have.has(platform)) continue;
    rows.push({
      platform,
      url: null,
      status: 'missing',
      issues: [{ kind: 'missing_profile', platform, severity: 'medium' }],
    });
  }
  return rows.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.platform.localeCompare(b.platform)
  );
}

export interface FixProposal {
  readonly issue: PresenceIssue;
  readonly title: string;
  /** Task text handed to an agent only after the user approves. */
  readonly agentTask: string;
  readonly requiresApproval: true;
  /** Always false: the loop proposes, it never posts or messages anyone. */
  readonly autoPost: false;
  /** Copy rule applied to any text the agent drafts. */
  readonly copyRule: 'lifestyle_only' | 'brand_voice';
}

const FIX_TITLES: Record<PresenceIssueKind, string> = {
  missing_profile: 'Create this profile',
  broken_link: 'Repair the broken link',
  stale_check: 'Re-check this profile',
  handle_mismatch: 'Align the handle',
  bio_mismatch: 'Update the bio',
  photo_mismatch: 'Update the photo',
  no_link_back_to_jovie: 'Add your Jovie link',
  jovie_does_not_link_out: 'Link this profile from your Jovie page',
};

/**
 * Every issue becomes exactly one approvable action: no dead ends.
 * Personal mode drafts lifestyle-only copy and never a product pitch
 * (decision: tim-personal-channels-lifestyle-only-2026-10-29).
 */
export function proposeFix(
  issue: PresenceIssue,
  mode: PresenceMode
): FixProposal {
  const title = FIX_TITLES[issue.kind];
  const rule = mode === 'personal' ? 'lifestyle_only' : 'brand_voice';
  return {
    issue,
    title: `${title} (${issue.platform})`,
    agentTask:
      `${title} on ${issue.platform}. Draft the change for approval; ` +
      `do not publish. Copy rule: ${rule}.`,
    requiresApproval: true,
    autoPost: false,
    copyRule: rule,
  };
}

export interface LoopMetrics {
  readonly profiles: number;
  readonly verifiedPct: number;
  readonly openIssues: number;
  readonly issuesBySeverity: Readonly<
    Record<PresenceIssue['severity'], number>
  >;
  /** Share of owned profiles whose bio/links point at Jovie. */
  readonly inboundCoverage: number;
  /** Share of owned profiles the Jovie page links out to. */
  readonly outboundCoverage: number;
  /** Mean of inbound and outbound: the headline link-web coverage. */
  readonly linkWebCoverage: number;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

export function computeLoopMetrics(rows: readonly PresenceRow[]): LoopMetrics {
  const present = rows.filter(r => r.status !== 'missing');
  const issues = rows.flatMap(r => r.issues);
  const hasIssue = (r: PresenceRow, k: PresenceIssueKind) =>
    r.issues.some(i => i.kind === k);
  const inbound = pct(
    present.filter(r => !hasIssue(r, 'no_link_back_to_jovie')).length,
    present.length
  );
  const outbound = pct(
    present.filter(r => !hasIssue(r, 'jovie_does_not_link_out')).length,
    present.length
  );
  return {
    profiles: rows.length,
    verifiedPct: pct(
      rows.filter(r => r.status === 'verified').length,
      rows.length
    ),
    openIssues: issues.length,
    issuesBySeverity: {
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
    },
    inboundCoverage: inbound,
    outboundCoverage: outbound,
    linkWebCoverage: Math.round(((inbound + outbound) / 2) * 10) / 10,
  };
}
