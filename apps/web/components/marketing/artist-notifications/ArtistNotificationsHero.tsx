import { AtSign, Headphones, Mail, MailCheck, Ticket } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { MarketingContainer } from '@/components/marketing';
import type { ArtistNotificationsLandingCopy } from '@/data/artistNotificationsCopy';

type FloatingCard =
  ArtistNotificationsLandingCopy['hero']['floatingCards'][number];

interface ArtistNotificationsHeroProps {
  readonly hero: ArtistNotificationsLandingCopy['hero'];
}

const CARD_ICONS: Record<
  FloatingCard['kind'],
  ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  capture: AtSign,
  subscribe: Mail,
  email: MailCheck,
  click: Headphones,
  outcome: Ticket,
};

const CARD_POSITIONS: Record<FloatingCard['kind'], string> = {
  capture:
    'lg:absolute lg:left-[2%] lg:top-[2%] lg:w-[17rem] lg:-rotate-[2deg]',
  subscribe:
    'lg:absolute lg:right-[4%] lg:top-[18%] lg:w-[16rem] lg:rotate-[1.5deg]',
  email: 'lg:absolute lg:left-[8%] lg:top-[40%] lg:w-[18rem] lg:rotate-[1deg]',
  click:
    'lg:absolute lg:right-[6%] lg:top-[58%] lg:w-[16rem] lg:-rotate-[1.5deg]',
  outcome:
    'lg:absolute lg:left-[14%] lg:bottom-[2%] lg:w-[17rem] lg:rotate-[2deg]',
};

export function ArtistNotificationsHero({
  hero,
}: Readonly<ArtistNotificationsHeroProps>) {
  return (
    <section className='relative overflow-hidden pb-20 pt-14 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24'>
      <div
        aria-hidden='true'
        className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_42%),radial-gradient(circle_at_80%_18%,rgba(86,182,255,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_48%)]'
      />
      <MarketingContainer width='landing' className='relative'>
        <div className='grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center'>
          <div className='max-w-[38rem]'>
            <h1 className='max-w-[10ch] text-[clamp(3.6rem,8.4vw,7.2rem)] font-semibold leading-[0.88] tracking-[-0.085em] text-primary-token'>
              {hero.headlineLines?.length
                ? hero.headlineLines.map(line =>
                    line ? (
                      <span key={line} className='block'>
                        {line}
                      </span>
                    ) : null
                  )
                : hero.headline}
            </h1>
            {hero.subhead ? (
              <p className='mt-6 max-w-[36rem] text-[clamp(1.05rem,1.9vw,1.5rem)] leading-[1.3] tracking-[-0.03em] text-secondary-token'>
                {hero.subhead}
              </p>
            ) : null}

            <div className='mt-8'>
              <Link
                href={hero.primaryCtaHref}
                className='inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[14px] font-medium text-black transition-colors hover:bg-white/90'
              >
                {hero.primaryCtaLabel}
              </Link>
            </div>
          </div>

          <div className='relative flex flex-col gap-3 lg:block lg:h-[32rem]'>
            {hero.floatingCards.map(card => (
              <div
                key={card.id}
                className={`${CARD_POSITIONS[card.kind]} w-full`}
              >
                <FloatingCardView card={card} />
              </div>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

function FloatingCardView({ card }: Readonly<{ card: FloatingCard }>) {
  const Icon = CARD_ICONS[card.kind];

  if (card.kind === 'subscribe') {
    return (
      <div className='rounded-[1.1rem] bg-white/[0.028] p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.26)]'>
        <div className='flex items-center gap-2 rounded-full bg-black/34 py-1 pl-3 pr-1'>
          <Mail
            className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
            strokeWidth={1.9}
          />
          <span className='min-w-0 flex-1 truncate text-[13px] text-secondary-token'>
            {card.detail}
          </span>
          <span className='inline-flex h-7 shrink-0 items-center rounded-full bg-white px-3 text-[12px] font-medium text-black'>
            {card.title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <article className='rounded-[1.1rem] bg-white/[0.028] p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.26)]'>
      <div className='flex items-start gap-3'>
        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-primary-token'>
          <Icon className='h-4 w-4' strokeWidth={1.9} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-[14px] font-semibold leading-[1.35] tracking-[-0.02em] text-primary-token'>
            {card.title}
          </p>
          {card.detail ? (
            <p className='mt-1.5 text-[13px] leading-[1.5] text-secondary-token'>
              {card.detail}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
