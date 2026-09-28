import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing/routeManifest';
import {
  isEditorialSitemapPath,
  SITEMAP_PUBLISHED_LEGAL_PATHS,
  SITEMAP_PUBLISHED_MACHINE_PATHS,
} from '@/lib/seo/sitemap-publication';
import {
  COMPANY_PRESENCE_CHECK_IDS,
  COMPANY_PRESENCE_CHECK_LABELS,
  type CompanyPageKind,
  type CompanyPresenceCheck,
  type CompanyPresenceCheckId,
  type CompanyPresencePage,
  type CompanyPresenceSourceStatus,
} from './model';
/** Declared reads stay unconfigured until a per-path source is wired. */
export const COMPANY_PRESENCE_SOURCES: readonly CompanyPresenceSourceStatus[] =
  [
    {
      id: 'indexed',
      label: COMPANY_PRESENCE_CHECK_LABELS.indexed,
      configured: false,
      reason:
        "Search Console coverage lives in Summer's company-signal snapshot, which Jovie does not read yet.",
    },
    {
      id: 'seo_certification',
      label: COMPANY_PRESENCE_CHECK_LABELS.seo_certification,
      configured: false,
      reason:
        'No per-page SEO and agentic certification result is published yet.',
    },
    {
      id: 'copy_gate',
      label: COMPANY_PRESENCE_CHECK_LABELS.copy_gate,
      configured: false,
      reason:
        'The copy gate runs on pull requests. Per-page results are not stored yet.',
    },
    {
      id: 'lighthouse',
      label: COMPANY_PRESENCE_CHECK_LABELS.lighthouse,
      configured: false,
      reason:
        'Lighthouse runs in CI. Per-page scores are not stored for Ovie yet.',
    },
  ];
export interface OwnedProfileRef {
  readonly username: string;
  readonly displayName: string | null;
}
function unconfiguredChecks(
  sources: readonly CompanyPresenceSourceStatus[]
): Record<CompanyPresenceCheckId, CompanyPresenceCheck> {
  const reasonById = new Map(sources.map(source => [source.id, source.reason]));
  return Object.fromEntries(
    COMPANY_PRESENCE_CHECK_IDS.map(id => [
      id,
      {
        state: 'unconfigured',
        reason: reasonById.get(id) ?? 'No source is connected for this check.',
      } satisfies CompanyPresenceCheck,
    ])
  ) as Record<CompanyPresenceCheckId, CompanyPresenceCheck>;
}

function titleCaseSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function labelForCompanyPath(path: string): string {
  if (path === '/') return 'Home';
  const segments = path.split('/').filter(Boolean);
  const last = segments.at(-1) ?? path;
  if (last.includes('.')) return last;
  return titleCaseSegment(last);
}

function kindForMarketingPath(path: string): CompanyPageKind {
  return isEditorialSitemapPath(path) ? 'editorial' : 'marketing';
}

/** Closed-world inventory of public Jovie routes and staff-owned profiles. */
export function buildCompanyPresencePages({
  ownedProfiles,
  sources = COMPANY_PRESENCE_SOURCES,
}: {
  readonly ownedProfiles: readonly OwnedProfileRef[];
  readonly sources?: readonly CompanyPresenceSourceStatus[];
}): CompanyPresencePage[] {
  const pages = new Map<string, CompanyPresencePage>();
  const add = (path: string, kind: CompanyPageKind, label: string) => {
    if (pages.has(path)) return;
    pages.set(path, {
      id: `${kind}:${path}`,
      path,
      label,
      kind,
      checks: unconfiguredChecks(sources),
    });
  };

  for (const target of MARKETING_EXACT_PUBLIC_ROUTE_TARGETS) {
    add(
      target.url,
      kindForMarketingPath(target.url),
      labelForCompanyPath(target.url)
    );
  }
  for (const path of SITEMAP_PUBLISHED_LEGAL_PATHS) {
    add(path, 'legal', labelForCompanyPath(path));
  }
  for (const path of SITEMAP_PUBLISHED_MACHINE_PATHS) {
    add(path, 'machine', labelForCompanyPath(path));
  }
  for (const profile of ownedProfiles) {
    add(
      `/${profile.username}`,
      'profile',
      profile.displayName?.trim() || `@${profile.username}`
    );
  }

  return [...pages.values()];
}
