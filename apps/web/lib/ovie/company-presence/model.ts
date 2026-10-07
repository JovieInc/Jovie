import type {
  ConnectionStatus,
  PresenceSignal,
} from '@/components/features/presence/types';

/** Jovie's pages use creator Presence primitives; unwired checks never render as zero. */

export * from '@/components/features/presence/company-types';

import {
  COMPANY_PRESENCE_CHECK_IDS,
  COMPANY_PRESENCE_CHECK_LABELS,
  type CompanyPageKind,
  type CompanyPresencePage,
} from '@/components/features/presence/company-types';
import { evaluatePresenceChecks } from '@/components/features/presence/evidence';
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
/** Canonical Presence status for a company page. */
export function getCompanyPageStatus(
  page: CompanyPresencePage,
  now: Date = new Date()
): ConnectionStatus {
  return evaluatePresenceChecks(
    COMPANY_PRESENCE_CHECK_IDS.map(id => ({
      label: COMPANY_PRESENCE_CHECK_LABELS[id],
      evidence: page.checks[id],
    })),
    now
  );
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
