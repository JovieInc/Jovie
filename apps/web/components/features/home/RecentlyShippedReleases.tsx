// Presentational half of RecentlyShippedSection, free of node:fs so it can
// render in the browser (Storybook a11y lane) from already-parsed releases.
import { Badge } from '@jovie/ui/atoms/badge';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

export interface CompactRelease {
  readonly version: string;
  readonly date: string;
  readonly highlights: readonly string[];
}

const VERSION_PREFIX = 'v';

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

export function RecentlyShippedReleases({
  releases,
}: Readonly<{ releases: readonly CompactRelease[] }>) {
  if (releases.length === 0) return null;

  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <Container size='homepage'>
        <div className='relative mx-auto max-w-linear-content'>
          <div className='reveal-on-scroll mb-10 flex flex-col items-center gap-3 text-center'>
            <Badge variant='outline' size='xl'>
              Recently Shipped
            </Badge>
            <h2 className='text-2xl md:text-3xl font-semibold tracking-tight line-clamp-2'>
              We Ship Fast
            </h2>
            <p className='text-sm md:text-base opacity-60 max-w-md'>
              See what we&apos;ve been building lately
            </p>
          </div>

          <div className='reveal-on-scroll grid gap-4 md:grid-cols-3'>
            {releases.map(release => {
              const versionLabel = `${VERSION_PREFIX}${release.version}`;

              return (
                <div
                  key={release.version}
                  className='rounded-xl border border-subtle bg-surface-1 p-5 transition-colors'
                >
                  <div className='flex items-center gap-2 mb-3'>
                    <Badge variant='outline' size='sm'>
                      {versionLabel}
                    </Badge>
                    {release.date && (
                      <span className='text-xs text-tertiary-token'>
                        {formatDate(release.date)}
                      </span>
                    )}
                  </div>
                  <ul className='space-y-1.5'>
                    {release.highlights.map(h => (
                      <li
                        key={h}
                        className='text-sm leading-relaxed opacity-70'
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className='reveal-on-scroll mt-8 text-center'>
            <Link
              href='/changelog'
              className='inline-flex items-center gap-1.5 text-sm font-medium opacity-60 hover:opacity-100 transition-opacity'
            >
              See all updates
              <ArrowRight className='h-3.5 w-3.5' />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
