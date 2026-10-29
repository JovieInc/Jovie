import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminReadUnavailable } from '@/components/features/admin/AdminReadUnavailable';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { listAlternatives } from '@/lib/copy-jam/alternatives.server';
import { COPY_ROWS, listCopyRoutes } from '@/lib/copy-jam/inventory';
import {
  type CopyVerdictRecord,
  computeStats,
  rewriteRatedGreatRate,
} from '@/lib/copy-jam/verdicts';
import { listCopyVerdicts } from '@/lib/copy-jam/verdicts.server';
import { captureError } from '@/lib/error-tracking';
import { CopyRowList } from './CopyRowList';
import { VoiceJam } from './VoiceJam';

export const metadata: Metadata = {
  title: 'Copy | Admin',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNFILTERED_CAP = 150;

interface PageProps {
  readonly searchParams: Promise<{ route?: string; unreviewed?: string }>;
}

function href(route: string | undefined, unreviewed: boolean) {
  const q = new URLSearchParams();
  if (route) q.set('route', route);
  if (unreviewed) q.set('unreviewed', '1');
  const s = q.toString();
  return s ? `?${s}` : '?';
}

export default async function AdminCopyPage({ searchParams }: PageProps) {
  await requireCurrentAdminPageAccess();
  const { route, unreviewed } = await searchParams;
  const onlyUnreviewed = unreviewed === '1';

  let verdicts: ReadonlyMap<string, CopyVerdictRecord> | null = null;
  try {
    verdicts = await listCopyVerdicts();
  } catch (error) {
    await captureError('Admin copy page failed to read verdicts', error, {
      route: 'admin/copy',
    });
  }

  const alternatives = await listAlternatives().catch(() => new Map());
  const routes = listCopyRoutes();
  const records = verdicts ? [...verdicts.values()] : [];
  const stats = computeStats(COPY_ROWS.length, records);
  const rewrite = rewriteRatedGreatRate(records);

  let rows = COPY_ROWS.filter(
    r => !route || r.route === route || r.alsoOn?.includes(route)
  );
  if (onlyUnreviewed && verdicts) rows = rows.filter(r => !verdicts.has(r.id));
  const matched = rows.length;
  const capped = !route && rows.length > UNFILTERED_CAP;
  if (capped) rows = rows.slice(0, UNFILTERED_CAP);

  const pct = (n: number | null) =>
    n === null ? 'n/a' : `${Math.round(n * 100)}%`;

  return (
    <AdminPage
      title='Copy'
      description='Every line of marketing copy. Say the ID and a verdict, or tap one.'
      testId='admin-copy-page'
    >
      <div className='flex flex-col gap-6'>
        <p className='text-sm text-secondary-token'>
          {stats.reviewed} of {stats.total} reviewed · {pct(stats.greatShare)}{' '}
          great · {stats.sucks} sucks · {stats.meh} meh · rewrites re-rated
          great {pct(rewrite.rate)} ({rewrite.rerated})
        </p>

        <VoiceJam />

        <nav
          aria-label='Filter By Route'
          className='flex flex-wrap gap-2 text-sm'
        >
          <Link
            href={href(undefined, onlyUnreviewed)}
            aria-current={route ? undefined : 'page'}
            className={
              route ? 'text-secondary-token' : 'text-primary-token underline'
            }
          >
            All routes
          </Link>
          {routes.map(r => (
            <Link
              key={r.route}
              href={href(r.route, onlyUnreviewed)}
              aria-current={route === r.route ? 'page' : undefined}
              className={
                route === r.route
                  ? 'text-primary-token underline'
                  : 'text-secondary-token'
              }
            >
              {r.route} <span className='text-tertiary-token'>{r.count}</span>
            </Link>
          ))}
        </nav>

        <div className='flex gap-4 text-sm'>
          <Link
            href={href(route, false)}
            className={
              onlyUnreviewed
                ? 'text-secondary-token'
                : 'text-primary-token underline'
            }
          >
            All
          </Link>
          <Link
            href={href(route, true)}
            className={
              onlyUnreviewed
                ? 'text-primary-token underline'
                : 'text-secondary-token'
            }
          >
            Unreviewed
          </Link>
        </div>

        {verdicts ? null : (
          <AdminReadUnavailable message='Verdicts could not be read. Review status is unknown, not empty.' />
        )}

        <CopyRowList
          rows={rows}
          alternatives={Object.fromEntries(
            [...alternatives].map(([id, a]) => [
              id,
              { forText: a.forText, alternatives: a.alternatives },
            ])
          )}
          verdicts={Object.fromEntries(
            [...(verdicts ?? new Map<string, CopyVerdictRecord>())].map(
              ([id, v]) => [id, { verdict: v.verdict, note: v.note }]
            )
          )}
        />

        {capped ? (
          <p className='text-sm text-tertiary-token'>
            Showing the first {UNFILTERED_CAP} of {matched}. Pick a route to see
            the rest.
          </p>
        ) : null}
      </div>
    </AdminPage>
  );
}
