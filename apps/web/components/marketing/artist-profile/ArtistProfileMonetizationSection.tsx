import { ArrowRight, QrCode } from 'lucide-react';
import type {
  ArtistProfileLandingCopy,
  ArtistProfileMode,
} from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

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
      <div className='mx-auto max-w-[1280px]'>
        <div className='mx-auto max-w-[48rem] text-center'>
          <h2 className='text-[clamp(3.35rem,7vw,6.9rem)] font-semibold leading-[0.88] tracking-[-0.08em] text-primary-token'>
            {monetization.headline}
          </h2>
          <p className='mx-auto mt-5 max-w-[35rem] text-[clamp(1.05rem,2vw,1.45rem)] font-medium leading-[1.25] tracking-[-0.04em] text-secondary-token'>
            {monetization.subhead}
          </p>
        </div>

        <div className='mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(260px,0.86fr)_minmax(0,1.12fr)] lg:items-stretch lg:gap-6'>
          <GetPaidCard card={monetization.paidCard} payMode={payMode} />
          <CaptureBridgeCard card={monetization.bridgeCard} />
          <SayThanksCard card={monetization.followUpCard} />
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
    <article className='relative isolate flex min-h-[560px] flex-col text-black lg:min-h-[620px]'>
      <div className='absolute inset-0 rounded-[1.9rem] bg-[#f7f7f2] shadow-[0_30px_90px_rgba(0,0,0,0.34)]' />
      <div
        className='absolute inset-x-0 bottom-0 h-[58%] rounded-[1.9rem] bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,0.06))]'
        aria-hidden='true'
      />
      <div className='relative z-10 px-7 pt-7 sm:px-8 sm:pt-8 lg:px-9 lg:pt-9'>
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
            <p className='mt-0.5 text-[11px] tracking-[-0.01em] text-black/52'>
              {card.contextDetail}
            </p>
          </div>
        </div>
      </div>

      <div className='relative z-10 mt-auto -mb-10 px-0 pt-20 sm:-mb-12 sm:pt-24 lg:-mb-14 lg:pt-28'>
        <div className='rounded-t-[2.2rem] rounded-b-none border border-white/4 border-b-0 bg-[#101010] px-5 pb-5 pt-4 text-white shadow-[0_-18px_55px_rgba(0,0,0,0.16)] sm:px-6 sm:pb-6 sm:pt-5 lg:px-7 lg:pb-7'>
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

function CaptureBridgeCard({
  card,
}: Readonly<{
  card: ArtistProfileLandingCopy['monetization']['bridgeCard'];
}>) {
  return (
    <article className='relative isolate flex min-h-[560px] flex-col overflow-hidden rounded-[1.9rem] border border-white/10 bg-[#121212] px-7 py-7 text-white shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:px-8 sm:py-8 lg:min-h-[620px] lg:px-8 lg:py-9'>
      <div>
        <h3 className='max-w-[9ch] text-[clamp(2.4rem,4.5vw,3.8rem)] font-semibold leading-[0.92] tracking-[-0.07em] text-white'>
          {card.title}
        </h3>
        <p className='mt-4 max-w-[16rem] text-[14px] leading-[1.55] tracking-[-0.02em] text-white/62'>
          {card.body}
        </p>
      </div>

      <div className='mt-auto mx-auto w-full max-w-[20rem] space-y-3 pt-20 lg:max-w-none lg:pt-24'>
        {card.states.map(state => (
          <div
            key={state.id}
            className='flex items-center justify-between gap-3 rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-4 py-4'
          >
            <span className='text-[12px] font-medium tracking-[-0.02em] text-white/68'>
              {state.label}
            </span>
            <span className='text-[12px] font-semibold tracking-[-0.02em] text-white'>
              {state.status}
            </span>
          </div>
        ))}
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
    <article className='relative isolate flex min-h-[560px] flex-col overflow-hidden rounded-[1.9rem] bg-[#fbfbf7] p-7 text-black shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:p-8 lg:min-h-[620px] lg:p-9'>
      <div
        className='absolute inset-x-0 top-0 h-[62%] bg-[linear-gradient(180deg,rgba(0,0,0,0.055),rgba(255,255,255,0))]'
        aria-hidden='true'
      />

      <div className='relative z-20 mx-auto w-full max-w-[24rem] pt-2'>
        <div className='rounded-[1.5rem] bg-black/[0.045] px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.08)] sm:px-5'>
          <div className='flex items-center justify-between gap-3'>
            <p className='truncate text-[12px] font-semibold tracking-[-0.02em] text-black/88'>
              {card.senderLabel}
            </p>
            <p className='text-[11px] font-medium text-black/38'>
              {card.timestampLabel}
            </p>
          </div>

          <p className='mt-3 text-[14px] font-semibold leading-snug tracking-[-0.03em] text-black/92'>
            {card.message}
          </p>

          <div className='mt-4 flex items-center justify-between rounded-[1rem] bg-white px-3.5 py-3'>
            <span className='min-w-0 truncate text-[12px] font-medium text-black/66'>
              {card.ctaLabel}
            </span>
            <ArrowRight
              className='h-3.5 w-3.5 text-black/35'
              strokeWidth={1.9}
            />
          </div>
        </div>
      </div>

      <div className='relative z-10 mt-auto max-w-[26rem] pt-24 sm:pt-28'>
        <h3 className='max-w-[11ch] text-[clamp(2.75rem,5vw,4.6rem)] font-semibold leading-[0.9] tracking-[-0.08em]'>
          {card.title}
        </h3>
        <p className='mt-5 max-w-[25rem] text-[15px] leading-[1.55] tracking-[-0.02em] text-black/62'>
          {card.body}
        </p>
      </div>
    </article>
  );
}
