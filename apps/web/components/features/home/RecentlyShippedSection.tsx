import fs from 'node:fs';
import { Badge } from '@jovie/ui/atoms/badge';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';

// ---------------------------------------------------------------------------
// Lightweight changelog parser (build-time only)
// ---------------------------------------------------------------------------

interface CompactRelease {
  version: string;
  date: string;
  highlights: string[];
}

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?$/;

function parseRecentReleases(markdown: string, count = 3): CompactRelease[] {
  const lines = markdown.split('\n');
  const releases: CompactRelease[] = [];
  let current: CompactRelease | null = null;

  for (const line of lines) {
    if (releases.length >= count) break;

    const vMatch = VERSION_HEADING_RE.exec(line);
    if (vMatch) {
      const [, version, date] = vMatch;
      if (version.toLowerCase() === 'unreleased') {
        current = null;
        continue;
      }
      current = { version, date: date || '', highlights: [] };
      releases.push(current);
      continue;
    }

    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && current.highlights.length < 3) {
      current.highlights.push(trimmed.slice(2));
    }
  }

  return releases;
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentlyShippedSection() {
  const changelogPath = resolveMonorepoPath('CHANGELOG.md');

  let markdown = '';
  if (fs.existsSync(changelogPath)) {
    markdown = fs.readFileSync(changelogPath, 'utf8');
  }

  const releases = parseRecentReleases(markdown, 3);
  if (releases.length === 0) return null;

  return (
    <section className='section-spacing-linear relative overflow-hidden bg-page'>
      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='reveal-on-scroll mb-10 flex flex-col items-center gap-3 text-center'>
            <Badge variant='outline' size='xl'>
              Recently Shipped
            </Badge>
            <h2 className='text-2xl md:text-3xl font-semibold tracking-tight'>
              We ship fast
            </h2>
            <p className='text-sm md:text-base opacity-60 max-w-md'>
              See what we&apos;ve been building lately
            </p>
          </div>

          <div className='reveal-on-scroll grid gap-4 md:grid-cols-3'>
            {releases.map(release => (
              <div
                key={release.version}
                className='rounded-xl p-5 transition-colors'
                style={{
                  backgroundColor:
                    'color-mix(in srgb, var(--linear-text-primary) 3%, transparent)',
                  border:
                    '1px solid color-mix(in srgb, var(--linear-text-primary) 8%, transparent)',
                }}
              >
                <div className='flex items-center gap-2 mb-3'>
                  <Badge variant='outline' className='font-mono text-[11px]'>
                    v{release.version}
                  </Badge>
                  {release.date && (
                    <span className='text-xs opacity-40'>
                      {formatDate(release.date)}
                    </span>
                  )}
                </div>
                <ul className='space-y-1.5'>
                  {release.highlights.map(h => (
                    <li key={h} className='text-sm leading-relaxed opacity-70'>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
