import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import { cn } from '@/lib/utils';

const FOOTER_CTA_ARCS = [
  { radiusX: 70, radiusY: 245 },
  { radiusX: 130, radiusY: 235 },
  { radiusX: 195, radiusY: 225 },
  { radiusX: 265, radiusY: 215 },
  { radiusX: 340, radiusY: 205 },
  { radiusX: 420, radiusY: 198 },
  { radiusX: 505, radiusY: 192 },
  { radiusX: 590, radiusY: 188 },
] as const;

interface MarketingFooterCtaProps {
  readonly className?: string;
}

export function MarketingFooterCta({
  className,
}: Readonly<MarketingFooterCtaProps>) {
  return (
    <section
      data-testid='homepage-v2-final-cta'
      className={cn(
        'homepage-story-final-cta relative isolate overflow-hidden bg-black',
        className
      )}
    >
      <div
        aria-hidden='true'
        className='homepage-final-cta-glow pointer-events-none absolute inset-0 z-[1]'
      />
      <svg
        className='homepage-final-cta-rays pointer-events-none absolute inset-x-0 bottom-0 z-[2] w-full'
        viewBox='0 0 1200 540'
        preserveAspectRatio='xMidYMax slice'
        aria-hidden='true'
      >
        <defs>
          <linearGradient
            id='homepage-final-cta-ray-primary'
            x1='0'
            x2='0'
            y1='0'
            y2='1'
          >
            <stop offset='0%' stopColor='#0070f3' stopOpacity='0' />
            <stop offset='55%' stopColor='#0070f3' stopOpacity='0.35' />
            <stop offset='92%' stopColor='#ffffff' stopOpacity='0.95' />
            <stop offset='100%' stopColor='#ffffff' stopOpacity='0.6' />
          </linearGradient>
          <linearGradient
            id='homepage-final-cta-ray-secondary'
            x1='0'
            x2='0'
            y1='0'
            y2='1'
          >
            <stop offset='0%' stopColor='#0070f3' stopOpacity='0' />
            <stop offset='70%' stopColor='#0070f3' stopOpacity='0.55' />
            <stop offset='100%' stopColor='#dbeaff' stopOpacity='0.85' />
          </linearGradient>
        </defs>
        <ellipse
          cx='600'
          cy='600'
          rx='22'
          ry='260'
          stroke='url(#homepage-final-cta-ray-secondary)'
          strokeWidth='2.2'
          fill='none'
        />
        {FOOTER_CTA_ARCS.map((arc, index) => (
          <ellipse
            key={`${arc.radiusX}-${arc.radiusY}`}
            cx='600'
            cy='600'
            rx={arc.radiusX}
            ry={arc.radiusY}
            stroke={
              index % 2 === 0
                ? 'url(#homepage-final-cta-ray-primary)'
                : 'url(#homepage-final-cta-ray-secondary)'
            }
            strokeWidth={index < 4 ? 1.5 : 1.2}
            fill='none'
            opacity={1 - index * 0.05}
          />
        ))}
        <rect
          x='0'
          y='538'
          width='1200'
          height='2'
          fill='#0070f3'
          opacity='0.3'
        />
      </svg>
      <MarketingContainer width='page' className='relative z-10'>
        <div className='homepage-final-cta-copy mx-auto'>
          <h2
            data-testid='homepage-v2-final-cta-heading'
            className='text-balance text-[clamp(2rem,3.4vw,3rem)] font-[680] leading-[1.05] tracking-[-0.025em] text-white'
          >
            Start using Jovie <span className='block'>today for free.</span>
          </h2>
          <Link
            href={APP_ROUTES.SIGNUP}
            className='homepage-final-cta-action public-action-primary focus-ring-themed'
            data-testid='homepage-v2-final-cta-primary'
          >
            {HOMEPAGE_V2_COPY.finalCta.primaryCtaLabel}
          </Link>
        </div>
      </MarketingContainer>
    </section>
  );
}
