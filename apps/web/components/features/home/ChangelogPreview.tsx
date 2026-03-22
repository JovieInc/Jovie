import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';

const RECENT_ENTRIES = [
  {
    title: 'Release automation',
    description:
      'Auto-generate smart links and notify fans the moment a release drops across DSPs.',
    date: 'Mar 11, 2026',
  },
  {
    title: 'Audience intelligence',
    description:
      'See every fan by name, where they came from, and which campaigns drive real engagement.',
    date: 'Feb 26, 2026',
  },
  {
    title: 'AI assistant',
    description:
      'Generate press kits, analyze streaming trends, and plan releases with an AI grounded in your catalog.',
    date: 'Feb 12, 2026',
  },
];

export function ChangelogPreview() {
  return (
    <section className='section-spacing-linear'>
      <MarketingContainer width='landing'>
        <div className='reveal-on-scroll'>
          <h2 className='marketing-h2-linear text-primary-token'>Changelog</h2>
        </div>

        <div
          className='reveal-on-scroll mt-8 space-y-0 divide-y divide-[rgba(255,255,255,0.06)]'
          data-delay='80'
        >
          {RECENT_ENTRIES.map(entry => (
            <Link
              key={entry.title}
              href='/changelog'
              className='group block py-5 transition-colors first:pt-0'
            >
              <div className='flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-6'>
                <h3 className='text-[15px] font-medium text-primary-token group-hover:text-[var(--linear-accent)] transition-colors sm:min-w-[200px]'>
                  {entry.title}
                </h3>
                <p className='flex-1 text-sm leading-relaxed text-secondary-token'>
                  {entry.description}
                </p>
                <span className='text-[13px] text-tertiary-token whitespace-nowrap'>
                  {entry.date}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className='reveal-on-scroll mt-6' data-delay='120'>
          <Link
            href='/changelog'
            className='text-sm font-medium text-secondary-token transition-colors hover:text-primary-token'
          >
            See all releases →
          </Link>
        </div>
      </MarketingContainer>
    </section>
  );
}
