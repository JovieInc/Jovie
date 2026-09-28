import { isPresenceObservationStale } from '@/lib/profile-surfaces/presence-identity';
import type {
  ConnectionStatus,
  PresenceSignal,
} from '@/lib/profile-surfaces/workspace';

/** Jovie's pages use creator Presence primitives; unwired checks never render as zero. */

export type CompanyPageKind =
  | 'marketing'
  | 'editorial'
  | 'profile'
  | 'legal'
  | 'machine';

export const COMPANY_PRESENCE_CHECK_IDS = [
  'indexed',
  'seo_certification',
  'copy_gate',
  'lighthouse',
] as const;

export type CompanyPresenceCheckId =
  (typeof COMPANY_PRESENCE_CHECK_IDS)[number];

export const COMPANY_PRESENCE_CHECK_LABELS: Readonly<
  Record<CompanyPresenceCheckId, string>
> = {
  indexed: 'Indexed',
  seo_certification: 'SEO Cert',
  copy_gate: 'Copy Gate',
  lighthouse: 'Lighthouse',
};

export type CompanyPresenceCheckOutcome = 'pass' | 'warn' | 'fail';

export type CompanyPresenceCheck =
  | {
      readonly state: 'unconfigured';
      readonly reason: string;
    }
  | {
      readonly state: 'measured';
      readonly outcome: CompanyPresenceCheckOutcome;
      /** Short measured value, e.g. `Indexed` or `92`. */
      readonly summary: string;
      readonly checkedAt: string;
    };

export interface CompanyPresencePage {
  readonly id: string;
  /** Site-relative path, e.g. `/pricing`. */
  readonly path: string;
  readonly label: string;
  readonly kind: CompanyPageKind;
  readonly checks: Readonly<
    Record<CompanyPresenceCheckId, CompanyPresenceCheck>
  >;
}

export interface CompanyPresenceSourceStatus {
  readonly id: CompanyPresenceCheckId;
  readonly label: string;
  readonly configured: boolean;
  /** Why the source is unconfigured; null once connected. */
  readonly reason: string | null;
}

export interface CompanyPresenceData {
  readonly pages: readonly CompanyPresencePage[];
  readonly sources: readonly CompanyPresenceSourceStatus[];
  /** Owned-profile lookup failed; profile rows are missing, not zero. */
  readonly profilesUnavailable: boolean;
}

export const COMPANY_PAGE_KIND_LABELS: Readonly<
  Record<CompanyPageKind, string>
> = {
  marketing: 'Marketing',
  editorial: 'Editorial',
  profile: 'Profile',
  legal: 'Legal',
  machine: 'Machine',
};

export function getCompanyPageLastCheckedAt(
  page: CompanyPresencePage
): string | null {
  let latest: string | null = null;
  for (const id of COMPANY_PRESENCE_CHECK_IDS) {
    const check = page.checks[id];
    if (check.state !== 'measured') continue;
    if (latest === null || Date.parse(check.checkedAt) > Date.parse(latest)) {
      latest = check.checkedAt;
    }
  }
  return latest;
}

function measuredChecks(page: CompanyPresencePage) {
  return COMPANY_PRESENCE_CHECK_IDS.flatMap(id => {
    const check = page.checks[id];
    return check.state === 'measured' ? [{ id, check }] : [];
  });
}

/** Canonical Presence status for a company page. */
export function getCompanyPageStatus(
  page: CompanyPresencePage,
  now: Date = new Date()
): ConnectionStatus {
  const measured = measuredChecks(page);
  const failing = measured.filter(({ check }) => check.outcome === 'fail');
  const warning = measured.filter(({ check }) => check.outcome === 'warn');

  if (failing.length > 0) {
    return {
      label: 'Needs Review',
      tone: 'error',
      needsAttention: true,
      sortPriority: 0,
      nextAction: `Fix the failing ${failing
        .map(({ id }) => COMPANY_PRESENCE_CHECK_LABELS[id])
        .join(', ')} check.`,
    };
  }
  if (warning.length > 0) {
    return {
      label: 'Needs Attention',
      tone: 'warning',
      needsAttention: true,
      sortPriority: 1,
      nextAction: `Review the ${warning
        .map(({ id }) => COMPANY_PRESENCE_CHECK_LABELS[id])
        .join(', ')} check.`,
    };
  }
  if (measured.length === 0) {
    return {
      label: 'Unconfigured',
      tone: 'neutral',
      needsAttention: false,
      sortPriority: 3,
      nextAction: 'No monitoring source reports on this page yet.',
    };
  }
  if (isPresenceObservationStale(getCompanyPageLastCheckedAt(page), now)) {
    return {
      label: 'Stale',
      tone: 'warning',
      needsAttention: true,
      sortPriority: 1,
      nextAction: 'The last check is older than two weeks.',
    };
  }
  if (measured.length < COMPANY_PRESENCE_CHECK_IDS.length) {
    return {
      label: 'Partially Measured',
      tone: 'neutral',
      needsAttention: false,
      sortPriority: 2,
      nextAction: 'Measured checks pass. Some sources are unconfigured.',
    };
  }
  return {
    label: 'Healthy',
    tone: 'success',
    needsAttention: false,
    sortPriority: 2,
    nextAction: 'No action needed.',
  };
}

/** One Presence signal per check, ordered blockers first. */
export function getCompanyPageSignals(
  page: CompanyPresencePage
): readonly PresenceSignal[] {
  const signals = COMPANY_PRESENCE_CHECK_IDS.map((id): PresenceSignal => {
    const check = page.checks[id];
    const label = COMPANY_PRESENCE_CHECK_LABELS[id];
    if (check.state === 'unconfigured') {
      return {
        kind: 'state',
        tone: 'neutral',
        label: `${label}: Unconfigured`,
        detail: check.reason,
        sortOrder: 3,
      };
    }
    if (check.outcome === 'fail') {
      return {
        kind: 'blocker',
        tone: 'error',
        label: `${label}: ${check.summary}`,
        detail: `${label} check failed.`,
        sortOrder: 0,
      };
    }
    if (check.outcome === 'warn') {
      return {
        kind: 'finding',
        tone: 'warning',
        label: `${label}: ${check.summary}`,
        detail: `${label} check needs attention.`,
        sortOrder: 1,
      };
    }
    return {
      kind: 'state',
      tone: 'success',
      label: `${label}: ${check.summary}`,
      detail: `${label} check passed.`,
      sortOrder: 3,
    };
  });
  return [...signals].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function sortCompanyPresencePages(
  pages: readonly CompanyPresencePage[],
  now: Date = new Date()
): CompanyPresencePage[] {
  return [...pages].sort((left, right) => {
    const priority =
      getCompanyPageStatus(left, now).sortPriority -
      getCompanyPageStatus(right, now).sortPriority;
    if (priority !== 0) return priority;
    return left.path.localeCompare(right.path);
  });
}

export type CompanyPresenceFilter = 'all' | CompanyPageKind;

export function filterCompanyPresencePages(
  pages: readonly CompanyPresencePage[],
  filter: CompanyPresenceFilter
): CompanyPresencePage[] {
  if (filter === 'all') return [...pages];
  return pages.filter(page => page.kind === filter);
}
