import { ArrowRight, CreditCard, Mail, Music2 } from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileMonetizationSectionProps {
  readonly monetization: ArtistProfileLandingCopy['monetization'];
}

const TIP_AMOUNTS = ['$5', '$10', '$25'] as const;

export function ArtistProfileMonetizationSection({
  monetization,
}: Readonly<ArtistProfileMonetizationSectionProps>) {
  return (
    <ArtistProfileSectionShell
      className='bg-[#050505] py-24 sm:py-28 lg:py-36'
      width='landing'
    >
      <div className='mx-auto max-w-[1120px]'>
        <div className='mx-auto max-w-[44rem] text-center'>
          <h2 className='text-[clamp(3.35rem,7vw,6.9rem)] font-semibold leading-[0.88] tracking-[-0.08em] text-primary-token'>
            {monetization.headline}
          </h2>
          <p className='mx-auto mt-5 max-w-[29rem] text-[clamp(1.05rem,2vw,1.45rem)] font-medium leading-[1.25] tracking-[-0.04em] text-secondary-token'>
            {monetization.subhead}
          </p>
        </div>

        <div className='mt-12 grid gap-5 lg:grid-cols-2 lg:items-stretch'>
          <GetPaidCard card={monetization.paidCard} />
          <SayThanksCard card={monetization.followUpCard} />
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

function GetPaidCard({
  card,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['paidCard'];
}>) {
  return (
    <article className='relative isolate flex min-h-[520px] flex-col overflow-hidden rounded-[1.75rem] bg-[#f7f7f2] p-6 text-black shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:p-8'>
      <div
        className='absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,0.06))]'
        aria-hidden='true'
      />
      <div className='relative z-10'>
        <h3 className='max-w-[10ch] text-[clamp(2.75rem,5vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em]'>
          {card.title}
        </h3>
      </div>

      <p className='relative z-10 mt-5 max-w-[25rem] text-[15px] leading-[1.55] tracking-[-0.02em] text-black/62'>
        {card.body}
      </p>

      <div className='relative z-10 mt-auto rounded-t-[1.65rem] bg-[#111] p-4 text-white shadow-[0_-18px_44px_rgba(0,0,0,0.22)] sm:p-5'>
        <div className='mx-auto mb-4 h-1 w-10 rounded-full bg-white/18' />
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-[15px] font-semibold tracking-[-0.03em] text-white/92'>
              Pay
            </p>
            <p className='mt-1 text-[12px] leading-snug text-white/48'>
              Choose an amount
            </p>
          </div>
          <span className='flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-white/72'>
            <CreditCard className='h-4 w-4' strokeWidth={1.9} />
          </span>
        </div>

        <div className='mt-5 grid grid-cols-3 gap-2'>
          {TIP_AMOUNTS.map(amount => (
            <span
              key={amount}
              className='rounded-full bg-white/[0.08] px-3 py-2 text-center text-[13px] font-semibold tracking-[-0.02em] text-white/88'
            >
              {amount}
            </span>
          ))}
        </div>

        <div className='mt-4 flex items-center justify-between rounded-[1rem] bg-white/[0.06] px-4 py-3'>
          <span className='text-[13px] font-medium tracking-[-0.02em] text-white/72'>
            Support
          </span>
          <ArrowRight className='h-4 w-4 text-white/42' strokeWidth={1.9} />
        </div>
      </div>
    </article>
  );
}

function SayThanksCard({
  card,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['followUpCard'];
}>) {
  return (
    <article className='relative isolate min-h-[520px] overflow-hidden rounded-[1.75rem] bg-[#fbfbf7] p-6 text-black shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:p-8'>
      <div
        className='absolute inset-x-0 top-0 h-[62%] bg-[linear-gradient(180deg,rgba(0,0,0,0.055),rgba(255,255,255,0))]'
        aria-hidden='true'
      />

      <div className='relative z-20 mx-auto max-w-[21.5rem] rounded-[1.35rem] bg-white p-4 shadow-[0_22px_55px_rgba(0,0,0,0.12)] sm:p-5'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <span
              className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white'
              aria-hidden='true'
            >
              <Mail className='h-4 w-4' strokeWidth={1.9} />
            </span>
            <div className='min-w-0'>
              <p className='truncate text-[13px] font-semibold tracking-[-0.02em]'>
                Jovie
              </p>
              <p className='truncate text-[11px] text-black/42'>
                Sent on behalf of the artist
              </p>
            </div>
          </div>
          <span className='rounded-full bg-black/[0.055] px-2.5 py-1 text-[11px] font-medium text-black/56'>
            Email
          </span>
        </div>

        <p className='mt-4 text-[14px] font-semibold leading-snug tracking-[-0.035em]'>
          {card.message}
        </p>

        <div className='mt-4 flex items-center justify-between rounded-[0.95rem] bg-black/[0.045] px-3 py-2.5'>
          <span className='flex min-w-0 items-center gap-2 text-[12px] font-medium text-black/64'>
            <Music2 className='h-3.5 w-3.5 shrink-0' strokeWidth={1.9} />
            <span className='truncate'>Listen now</span>
          </span>
          <ArrowRight className='h-3.5 w-3.5 text-black/35' strokeWidth={1.9} />
        </div>
      </div>

      <div className='relative z-10 mt-12 sm:mt-14'>
        <h3 className='max-w-[10ch] text-[clamp(2.75rem,5vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em]'>
          {card.title}
        </h3>
        <p className='mt-5 max-w-[25rem] text-[15px] leading-[1.55] tracking-[-0.02em] text-black/62'>
          {card.body}
        </p>
      </div>
    </article>
  );
}
