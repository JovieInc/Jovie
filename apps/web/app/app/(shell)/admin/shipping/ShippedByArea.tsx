import { ExternalLink } from 'lucide-react';
import {
  type LedgerArea,
  type LedgerEntry,
  renderAudienceView,
} from '@/lib/release-ledger';

export interface ShippedPullRequest {
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly mergedAt: string;
}

const AREA_LABELS: Record<LedgerArea, string> = {
  website: 'Website',
  app: 'Jovie app',
  mobile: 'Mobile',
  desktop: 'Desktop',
  billing: 'Billing',
  ai: 'AI and chat',
  data: 'Data and ingest',
  ovie: 'Ovie',
  delivery: 'Delivery and CI',
  dependencies: 'Dependencies',
  docs: 'Docs',
  other: 'Other',
};

export function groupShippedByArea(recent: readonly ShippedPullRequest[]) {
  const byNumber = new Map(recent.map(pr => [`${pr.repo}#${pr.number}`, pr]));
  // Ledger numbers are per repo; key by repo so cross-repo PRs cannot collide.
  const groups: {
    area: LedgerArea;
    items: { entry: LedgerEntry; pr: ShippedPullRequest }[];
  }[] = [];
  const perRepo = new Map<string, ShippedPullRequest[]>();
  for (const pr of byNumber.values()) {
    perRepo.set(pr.repo, [...(perRepo.get(pr.repo) ?? []), pr]);
  }
  const index = new Map<LedgerArea, (typeof groups)[number]>();
  for (const [, prs] of perRepo) {
    const view = renderAudienceView(
      prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        mergedAt: pr.mergedAt,
      })),
      'ops'
    );
    for (const group of view.groups) {
      let target = index.get(group.area);
      if (!target) {
        target = { area: group.area, items: [] };
        index.set(group.area, target);
        groups.push(target);
      }
      for (const entry of group.entries) {
        const pr = prs.find(item => item.number === entry.number);
        if (pr) target.items.push({ entry, pr });
      }
    }
  }
  return groups.sort((a, b) => b.items.length - a.items.length);
}

/** Ops view of the changelog ledger: everything that landed today, by area. */
export function ShippedByAreaView({
  recent,
}: {
  readonly recent: readonly ShippedPullRequest[];
}) {
  const groups = groupShippedByArea(recent);
  return (
    <section aria-labelledby='shipped-by-area-title' className='space-y-3 p-4'>
      <h2
        id='shipped-by-area-title'
        className='text-sm font-semibold text-primary-token'
      >
        Shipped Today By Area
      </h2>
      {groups.length === 0 ? (
        <p className='text-xs text-secondary-token'>
          No merges recorded since Pacific midnight.
        </p>
      ) : (
        groups.map(group => (
          <div key={group.area} data-testid={`shipped-area-${group.area}`}>
            <h3 className='text-xs font-medium text-secondary-token'>
              {AREA_LABELS[group.area]} · {group.items.length}
            </h3>
            <ul className='mt-1 divide-y divide-subtle'>
              {group.items.map(({ entry, pr }) => (
                <li key={`${pr.repo}#${pr.number}`} className='py-1.5'>
                  <a
                    href={pr.url}
                    target='_blank'
                    rel='noreferrer'
                    className='flex items-start justify-between gap-3 text-xs text-primary-token hover:underline'
                  >
                    <span className='min-w-0'>
                      <span className='text-tertiary-token'>
                        {entry.kind}
                        {' · '}
                      </span>
                      {entry.opsSummary}
                    </span>
                    <span className='inline-flex shrink-0 items-center gap-1 tabular-nums text-tertiary-token'>
                      #{pr.number}
                      <ExternalLink className='h-3 w-3' aria-hidden='true' />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

/** Server wrapper: reads the shared 60s merge cache. Unknown is never "none". */
export async function ShippedByArea() {
  const { readConfiguredMerges } = await import(
    '@/lib/ovie/shipping-state/configured.server'
  );
  const read = await readConfiguredMerges();
  const recent =
    read.status === 'ok' ? (read.delivery?.merges?.recent ?? null) : null;
  if (!recent) {
    return (
      <section className='p-4'>
        <h2 className='text-sm font-semibold text-primary-token'>
          Shipped Today By Area
        </h2>
        <p role='status' className='text-xs text-secondary-token'>
          UNKNOWN — merge feed unavailable.
        </p>
      </section>
    );
  }
  return <ShippedByAreaView recent={recent} />;
}
