import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import { formatCustomerChangelogDate } from '@/lib/customer-changelog';

/** Keep every public release discoverable when the outcome archive paginates. */
export function ReleaseNotesIndex({
  releases,
}: {
  readonly releases: readonly Pick<ChangelogRelease, 'version' | 'date'>[];
}) {
  if (releases.length === 0) return null;

  return (
    <details className='mt-6 text-sm text-secondary-token'>
      <summary className='cursor-pointer'>All Release Notes</summary>
      <nav aria-label='Release Notes By Date'>
        <ul className='mt-4 space-y-2'>
          {releases.map(release => (
            <li key={release.version}>
              <Link
                href={`${APP_ROUTES.CHANGELOG}/${encodeURIComponent(release.version)}`}
              >
                {formatCustomerChangelogDate(release.date)} · {release.version}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
