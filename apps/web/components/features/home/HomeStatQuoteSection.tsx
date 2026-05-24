/**
 * Home — single stat pull-quote with arc-light ambient bg.
 *
 * Source: Claude Design home-page-hero bundle, SectionStatQuote.jsx.
 * Server component, fully static.
 */

const ACCENT = 'var(--geist-purple-solid)';
const ARC_OFFSETS = [120, 200, 280, 360, 440, 520] as const;

interface HomeStatQuoteSectionProps {
  readonly stat?: string;
  readonly body?: string;
  readonly source?: string;
}

export function HomeStatQuoteSection({
  stat = '2.9x',
  body = 'faster releases that compound into more fans.',
  source = 'Indie release benchmark, 2026',
}: HomeStatQuoteSectionProps = {}) {
  const id = 'sq-purple';
  return (
    <section className='relative overflow-hidden bg-black px-6 py-32 sm:py-40'>
      <svg
        viewBox='0 0 1400 600'
        preserveAspectRatio='xMidYMid slice'
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 h-full w-full'
      >
        <defs>
          <linearGradient id={`${id}-g`} x1='0' x2='1' y1='0' y2='0'>
            <stop offset='0%' stopColor={ACCENT} stopOpacity='0' />
            <stop offset='40%' stopColor={ACCENT} stopOpacity='0.18' />
            <stop offset='100%' stopColor={ACCENT} stopOpacity='0' />
          </linearGradient>
        </defs>
        {ARC_OFFSETS.map((y, i) => (
          <path
            key={y}
            d={`M -200 ${y} Q 700 ${y - 30 + i * 4} 1600 ${y + 20}`}
            stroke={`url(#${id}-g)`}
            strokeWidth={i % 2 ? 1 : 0.6}
            fill='none'
            opacity={0.7 - i * 0.08}
          />
        ))}
      </svg>
      <div className='relative mx-auto max-w-[1200px] text-left'>
        <h3 className='m-0 max-w-[22ch] font-[var(--marketing-font-display)] text-[clamp(1.875rem,4vw,2.75rem)] font-bold leading-[1.12] tracking-[-0.025em] text-[#F7F8F8]'>
          <span>Jovie delivers {stat}</span>
          <span className='text-[#8A8F98]'> {body}</span>
        </h3>
        <div className='mt-7 font-[var(--marketing-font-body)] text-sm italic text-[#8A8F98]'>
          {source}
        </div>
      </div>
    </section>
  );
}
