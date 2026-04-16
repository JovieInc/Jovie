import {
  ArrowRight,
  BellRing,
  CircleDollarSign,
  MailCheck,
  QrCode,
} from 'lucide-react';
import type {
  ArtistProfileLandingCopy,
  ArtistProfileMode,
} from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

const RELATIONSHIP_TIMELINE_CARD_META = {
  payment: {
    icon: CircleDollarSign,
    timestamp: 'Just now',
    iconClassName: 'text-[#9fddb3]',
    chipClassName:
      'bg-[#163325] text-[#b9e8c7] ring-[#2d5943]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  },
  'follow-up-sent': {
    icon: MailCheck,
    timestamp: '1 min',
    iconClassName: 'text-[#a7c5ff]',
    chipClassName:
      'bg-[#16233a] text-[#c8d9ff] ring-[#304b73]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  },
  'fan-reached': {
    icon: BellRing,
    timestamp: '4 min',
    iconClassName: 'text-[#d2c7ff]',
    chipClassName:
      'bg-[#221a38] text-[#ddd5ff] ring-[#43356a]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  },
} as const;

interface ArtistProfileMonetizationSectionProps {
  readonly monetization: ArtistProfileLandingCopy['monetization'];
  readonly payMode: ArtistProfileMode;
}

export function ArtistProfileMonetizationSection({
  monetization,
  payMode,
}: Readonly<ArtistProfileMonetizationSectionProps>) {
  return (
    <ArtistProfileSectionShell
      className='bg-[#050505] py-24 sm:py-28 lg:py-36'
      width='page'
    >
      <div className='mx-auto max-w-[1380px]'>
        <div className='mx-auto max-w-[48rem] text-center'>
          <h2 className='text-[clamp(3.35rem,7vw,6.9rem)] font-semibold leading-[0.88] tracking-[-0.08em] text-primary-token'>
            {monetization.headline}
          </h2>
          <p className='mx-auto mt-5 max-w-[35rem] text-[clamp(1.05rem,2vw,1.45rem)] font-medium leading-[1.25] tracking-[-0.04em] text-secondary-token'>
            {monetization.subhead}
          </p>
        </div>

        <div className='mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch'>
          <GetPaidCard card={monetization.paidCard} payMode={payMode} />
          <RelationshipCard card={monetization.relationshipCard} />
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

function GetPaidCard({
  card,
  payMode,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['paidCard'];
  payMode: ArtistProfileMode;
}>) {
  return (
    <article className='relative isolate flex min-h-[560px] flex-col rounded-[1.9rem] bg-[#f7f7f2] px-7 pt-7 text-black shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:px-8 sm:pt-8 lg:min-h-[640px] lg:px-10 lg:pt-10'>
      <div
        className='pointer-events-none absolute inset-x-0 bottom-0 h-[62%] rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,0.06))]'
        aria-hidden='true'
      />
      <div className='relative z-10'>
        <h3 className='max-w-[10ch] text-[clamp(2.75rem,5vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em]'>
          {card.title}
        </h3>

        <p className='mt-5 max-w-[25rem] text-[15px] leading-[1.55] tracking-[-0.02em] text-black/62'>
          {card.body}
        </p>

        <div className='mt-7 flex w-fit items-center gap-3 rounded-full bg-black/[0.045] px-4 py-3 text-black/72'>
          <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white'>
            <QrCode className='h-4 w-4' strokeWidth={1.9} />
          </span>
          <div className='min-w-0'>
            <p className='text-[12px] font-semibold tracking-[-0.02em] text-black/86'>
              {card.contextLabel}
            </p>
            <p className='mt-0.5 text-[11px] tracking-[-0.01em] text-black/64'>
              {card.contextDetail}
            </p>
          </div>
        </div>
      </div>

      <div className='relative z-10 mt-auto -mx-7 -mb-7 px-0 pt-20 sm:-mx-8 sm:-mb-8 sm:pt-24 lg:-mx-10 lg:-mb-10 lg:pt-28'>
        <div className='rounded-t-[2.25rem] rounded-b-none border-x border-t border-white/4 bg-[#101010] px-5 pb-6 pt-4 text-white shadow-[0_-18px_55px_rgba(0,0,0,0.16)] sm:px-6 sm:pb-7 sm:pt-5 lg:px-7 lg:pb-8'>
          <div className='mx-auto mb-5 h-1 w-10 rounded-full bg-white/18' />
          <p className='text-[15px] font-semibold tracking-[-0.03em] text-white/92'>
            {payMode.drawer.title}
          </p>
          <p className='mt-1 text-[12px] leading-snug text-white/48'>
            {payMode.drawer.subtitle}
          </p>

          <div className='mt-5 grid grid-cols-3 gap-2.5'>
            {payMode.drawer.items.map(item => (
              <div
                key={item.id}
                className='rounded-[1rem] bg-white/[0.08] px-2.5 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
              >
                <p className='text-[17px] font-semibold leading-none tracking-[-0.04em] text-white'>
                  {item.label}
                </p>
                <p className='mt-1 truncate text-[10px] font-medium tracking-[-0.02em] text-white/48'>
                  {item.detail}
                </p>
                <p className='mt-1 text-[10px] font-semibold leading-none tracking-[-0.02em] text-white/72'>
                  {item.action}
                </p>
              </div>
            ))}
          </div>

          <div className='mt-4 flex items-center justify-between rounded-[1rem] bg-white px-4 py-3 text-black'>
            <span className='text-[13px] font-medium tracking-[-0.02em] text-black/84'>
              {payMode.drawer.ctaLabel}
            </span>
            <ArrowRight className='h-4 w-4 text-black/45' strokeWidth={1.9} />
          </div>
        </div>
      </div>
    </article>
  );
}

function RelationshipCard({
  card,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['relationshipCard'];
}>) {
  const stackOffsets = [
    'sm:-translate-x-3',
    'sm:translate-x-3',
    'sm:-translate-x-1',
  ] as const;

  const stackWidths = [
    'max-w-[19rem] sm:max-w-[20.5rem]',
    'max-w-[21rem] sm:max-w-[22.75rem]',
    'max-w-[19.25rem] sm:max-w-[20.75rem]',
  ] as const;

  return (
    <article className='relative isolate flex min-h-[560px] flex-col overflow-hidden rounded-[1.9rem] bg-[#f7f7f2] p-7 text-black shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:p-8 lg:min-h-[640px] lg:p-10'>
      <div
        className='absolute inset-x-0 top-0 h-[62%] bg-[linear-gradient(180deg,rgba(0,0,0,0.055),rgba(255,255,255,0))]'
        aria-hidden='true'
      />
      <div
        aria-hidden='true'
        className='absolute inset-x-[18%] top-10 h-40 rounded-full bg-black/[0.04] blur-3xl'
      />

      <div className='relative z-20 mx-auto w-full max-w-[22.5rem] pt-2 sm:max-w-[24rem]'>
        <div
          aria-hidden='true'
          className='absolute bottom-7 left-1/2 top-10 w-px -translate-x-1/2 bg-[linear-gradient(180deg,rgba(16,16,16,0.02),rgba(16,16,16,0.1),rgba(16,16,16,0.04))]'
        />
        <div className='relative grid gap-4.5'>
          {card.timeline.map((step, index) => (
            <RelationshipTimelineCard
              key={step.id}
              step={step}
              className={[
                stackOffsets[index] ?? '',
                stackWidths[index] ?? 'max-w-[18.5rem]',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      <div className='relative z-10 mt-auto max-w-[24rem] pt-12 sm:pt-16'>
        <p className='text-[11px] font-medium tracking-[-0.01em] text-black/42'>
          Retention loop
        </p>
        <h3 className='mt-2 max-w-[7ch] text-[clamp(2.1rem,4vw,3.4rem)] font-semibold leading-[0.92] tracking-[-0.065em]'>
          {card.title}
        </h3>
        <p className='mt-4 max-w-[21rem] text-[14px] leading-[1.55] tracking-[-0.02em] text-black/58'>
          {card.body}
        </p>
      </div>
    </article>
  );
}

function RelationshipTimelineCard({
  step,
  className,
}: Readonly<{
  step: ArtistProfileLandingCopy['monetization']['relationshipCard']['timeline'][number];
  className?: string;
}>) {
  const meta =
    RELATIONSHIP_TIMELINE_CARD_META[
      step.id as keyof typeof RELATIONSHIP_TIMELINE_CARD_META
    ];
  const Icon = meta.icon;

  return (
    <div
      className={[
        'relative mx-auto w-full rounded-[1.1rem] border border-white/[0.055] bg-[#111214]/96 px-4 py-4 text-white shadow-[0_12px_28px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl sm:px-5 sm:py-[1.125rem]',
        className ?? '',
      ].join(' ')}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]'
      />
      <div className='flex items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <span
            className={[
              'flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[0.65rem] bg-white/[0.045] ring-1 ring-white/[0.06]',
              meta.iconClassName,
            ].join(' ')}
          >
            <Icon className='h-4 w-4' strokeWidth={1.9} />
          </span>
          <div className='min-w-0'>
            <p className='truncate text-[11px] font-medium tracking-[-0.01em] text-white/46'>
              {step.label}
            </p>
          </div>
        </div>
        <p className='shrink-0 text-[10px] font-medium tracking-[-0.01em] text-white/32'>
          {meta.timestamp}
        </p>
      </div>

      <p className='mt-3 text-[13px] font-semibold leading-[1.28] tracking-[-0.028em] text-white/96 sm:text-[13.5px]'>
        {step.title}
      </p>
      <p className='mt-2.5 text-[12px] leading-[1.45] text-white/56'>
        {step.detail}
      </p>
      <div className='mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3'>
        <span
          className={[
            'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[-0.01em] ring-1',
            meta.chipClassName,
          ].join(' ')}
        >
          {step.meta}
        </span>
        <span aria-hidden='true' className='h-1 w-1 rounded-full bg-white/20' />
      </div>
    </div>
  );
}
