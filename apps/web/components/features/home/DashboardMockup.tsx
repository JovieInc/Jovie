import Image from 'next/image';
import { RELEASES } from './releases-data';

/* ------------------------------------------------------------------ */
/*  Dashboard mockup — shared between hero and releases sections        */
/* ------------------------------------------------------------------ */

export function DashboardMockup({
  activeIndex,
  rowRefs,
  urlRefs,
  footerRef,
  variant = 'default',
}: {
  readonly activeIndex: number;
  readonly rowRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>;
  readonly urlRefs?: React.MutableRefObject<(HTMLSpanElement | null)[]>;
  readonly footerRef?: React.RefObject<HTMLDivElement | null>;
  readonly variant?: 'default' | 'hero';
}) {
  const isHero = variant === 'hero';

  return (
    <div
      className='relative overflow-hidden rounded-[0.95rem] md:rounded-[1rem]'
      style={{
        border: '1px solid var(--linear-border-subtle)',
        backgroundColor: 'var(--linear-bg-surface-0)',
        boxShadow: isHero
          ? [
              '0 0 0 1px rgba(255,255,255,0.03)',
              '0 16px 48px rgba(0,0,0,0.28)',
              '0 28px 80px rgba(0,0,0,0.16)',
            ].join(', ')
          : [
              '0 0 0 1px rgba(255,255,255,0.03)',
              '0 8px 28px rgba(0,0,0,0.28)',
              '0 18px 48px rgba(0,0,0,0.18)',
            ].join(', '),
      }}
    >
      {/* Shine edge */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 z-10 h-px'
        style={{
          background: isHero
            ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 76%, transparent)'
            : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 70%, transparent)',
        }}
      />

      {/* Mac window chrome */}
      <div className='flex h-10 items-center border-b border-subtle bg-surface-1 px-5'>
        <div className='flex gap-2' aria-hidden='true'>
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#ED6A5E]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#F4BF4F]' />
          <div className='h-3 w-3 rounded-full border border-black/10 bg-[#61C554]' />
        </div>
        <div className='flex-1 text-center text-xs text-tertiary-token'>
          Jovie - Release Flow
        </div>
        <div className='w-[52px]' />
      </div>

      {/* Column headers */}
      <div
        className='grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2 max-md:hidden'
        style={{ borderBottom: '1px solid var(--linear-border-subtle)' }}
      >
        <span className='text-[10px] font-medium uppercase tracking-[0.08em] text-quaternary-token'>
          Release
        </span>
        <span />
        <span className='text-[10px] font-medium uppercase tracking-[0.08em] text-quaternary-token'>
          Smart link
        </span>
      </div>

      {/* Release rows */}
      {RELEASES.map((release, i) => {
        const isActive = i === activeIndex;
        return (
          <div
            key={release.id}
            ref={el => {
              if (rowRefs) rowRefs.current[i] = el;
            }}
            className='transition-colors duration-slower'
            style={{
              backgroundColor: isActive
                ? 'rgba(255,255,255,0.035)'
                : 'transparent',
              borderBottom:
                i < RELEASES.length - 1
                  ? '1px solid var(--linear-border-subtle)'
                  : undefined,
            }}
          >
            {/* Desktop row layout */}
            <div className='max-md:hidden md:grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-2.5'>
              <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2'>
                <Image
                  src={release.artwork}
                  alt={release.title}
                  fill
                  className='object-cover'
                  sizes='40px'
                />
              </div>

              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <p className='truncate text-sm font-medium text-primary-token'>
                    {release.title}
                  </p>
                  {release.isNew && (
                    <span className='shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400'>
                      New
                    </span>
                  )}
                </div>
                <p className='text-xs text-tertiary-token'>
                  {release.type} - {release.year}
                </p>
              </div>

              <div
                className='flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all duration-slower'
                style={{
                  backgroundColor: isActive
                    ? 'rgba(255,255,255,0.07)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <svg
                  width='11'
                  height='11'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='text-tertiary-token'
                  aria-hidden='true'
                >
                  <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
                  <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
                </svg>
                <span
                  ref={el => {
                    if (urlRefs) urlRefs.current[i] = el;
                  }}
                  className='font-mono text-xs transition-colors duration-slower'
                  style={{
                    color: isActive
                      ? 'var(--linear-text-secondary)'
                      : 'var(--linear-text-tertiary)',
                  }}
                >
                  jov.ie/{release.slug}
                </span>
              </div>
            </div>

            {/* Mobile row layout — stacked */}
            <div className='md:hidden px-5 py-2.5'>
              <div className='flex items-center gap-3'>
                <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2'>
                  <Image
                    src={release.artwork}
                    alt={release.title}
                    fill
                    className='object-cover'
                    sizes='40px'
                  />
                </div>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p className='truncate text-sm font-medium text-primary-token'>
                      {release.title}
                    </p>
                    {release.isNew && (
                      <span className='shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400'>
                        New
                      </span>
                    )}
                  </div>
                  <p className='text-xs text-tertiary-token'>
                    {release.type} - {release.year}
                  </p>
                </div>
              </div>
              <div className='mt-2 ml-[52px] flex items-center gap-1.5'>
                <svg
                  width='11'
                  height='11'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='text-tertiary-token'
                  aria-hidden='true'
                >
                  <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
                  <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
                </svg>
                <span className='font-mono text-xs text-tertiary-token'>
                  jov.ie/{release.slug}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer punchline */}
      {isHero ? null : (
        <div
          ref={footerRef}
          className='flex items-center justify-center px-5 py-2.5'
        >
          <p className='text-xs text-quaternary-token'>
            + pre-save ready, matched across platforms, and shareable in one
            link
          </p>
        </div>
      )}
    </div>
  );
}
