import {
  ArrowDown,
  ArrowRight,
  Check,
  Copy,
  QrCode,
  Search,
} from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

const STEP_NUMBER_STYLES = [
  'from-[#f6f9ff] via-[#9cb9ff] to-[#6577ff]',
  'from-[#fbfdff] via-[#b7c7ff] to-[#7896ff]',
  'from-[#f2fffb] via-[#92e6cf] to-[#5fa8ff]',
];

function ClaimMoment() {
  return (
    <div className='mt-3 w-full max-w-[18rem] rounded-[1.05rem] bg-black/46 p-2.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.22)]'>
      <div className='mb-2 flex items-center justify-between gap-3 px-1'>
        <span className='text-[11px] font-semibold text-primary-token'>
          Artist Search
        </span>
        <span className='rounded-full bg-white/[0.055] px-2 py-1 text-[10px] font-medium text-secondary-token'>
          Verified
        </span>
      </div>
      <div className='flex h-10 items-center gap-2 rounded-full bg-white/[0.055] px-3 text-[12px] text-secondary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'>
        <Search
          className='h-3.5 w-3.5 text-primary-token/76'
          strokeWidth={1.8}
        />
        <span className='text-tertiary-token'>Search</span>
        <span className='font-medium text-primary-token'>Tim White</span>
      </div>
      <div className='mt-2 flex items-center gap-3 rounded-[0.9rem] bg-white/[0.04] px-2.5 py-2'>
        <div
          className='h-8 w-8 rounded-full bg-[linear-gradient(135deg,#f6f9ff,#7fa3ff)]'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[12px] font-semibold text-primary-token'>
            Tim White
          </p>
          <p className='text-[11px] text-tertiary-token'>
            Spotify artist verified
          </p>
        </div>
        <span className='rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-black shadow-[0_6px_18px_rgba(255,255,255,0.08)]'>
          Claim
        </span>
      </div>
    </div>
  );
}

function BuildMoment() {
  return (
    <div className='mt-3 w-full max-w-[18rem]'>
      <div className='rounded-[1.05rem] bg-black/46 p-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.22)]'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-[11px] font-semibold text-primary-token'>
            Importing catalog
          </span>
          <span className='flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-sky-100'>
            <Check className='h-3 w-3' strokeWidth={2} />
            27+ providers
          </span>
        </div>
        <div className='mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]'>
          <div className='h-full w-[86%] rounded-full bg-[linear-gradient(90deg,#9cb9ff,#92e6cf)] shadow-[0_0_14px_rgba(146,230,207,0.22)]' />
        </div>
        <div className='mt-2.5 grid gap-1.5'>
          {[
            ['Profile photo', 'Synced'],
            ['Top tracks', 'Synced'],
            ['Latest release', 'Ready'],
          ].map(([item, status]) => (
            <div
              key={item}
              className='flex items-center justify-between gap-3 rounded-full bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-secondary-token'
            >
              <span>{item}</span>
              <span className='flex items-center gap-1.5 text-primary-token/82'>
                {status}
                <Check className='h-3 w-3 text-sky-100/80' strokeWidth={2} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShareMoment() {
  return (
    <div className='mt-3 w-full max-w-[18rem] rounded-[1.05rem] bg-black/46 p-2.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.22)]'>
      <div className='mb-2 flex items-center justify-between gap-3 px-1'>
        <span className='text-[11px] font-semibold text-primary-token'>
          Profile Link
        </span>
        <Check className='h-3.5 w-3.5 text-sky-100/78' strokeWidth={2} />
      </div>
      <div className='flex items-center justify-between gap-3 rounded-full bg-white/[0.055] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'>
        <span className='font-mono text-[11px] text-secondary-token'>
          jov.ie/timwhite
        </span>
        <span className='flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-black'>
          <Copy className='h-3 w-3' strokeWidth={2} />
          Copied
        </span>
      </div>
      <div className='mt-2 flex items-center gap-2.5 rounded-[0.9rem] bg-white/[0.04] px-2.5 py-2'>
        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-white/[0.06] text-primary-token'>
          <QrCode className='h-4 w-4' strokeWidth={1.8} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[12px] font-semibold text-primary-token'>
            Share-ready profile
          </p>
          <p className='text-[11px] text-tertiary-token'>Bio / Stories / QR</p>
        </div>
      </div>
      <div className='mt-2 flex flex-wrap gap-1.5'>
        {['Bio', 'Stories', 'QR'].map(channel => (
          <span
            key={channel}
            className='rounded-full bg-white/[0.045] px-2 py-1 text-[10px] font-medium text-secondary-token'
          >
            {channel}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepMoment({
  stepId,
}: Readonly<{
  stepId: ArtistProfileLandingCopy['howItWorks']['steps'][number]['id'];
}>) {
  if (stepId === 'claim') return <ClaimMoment />;
  if (stepId === 'connect') return <BuildMoment />;
  return <ShareMoment />;
}

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell
      width='landing'
      className='bg-black py-8 sm:py-10 lg:py-12'
    >
      <div className='relative overflow-hidden rounded-[1.6rem] bg-[radial-gradient(circle_at_18%_10%,rgba(101,119,255,0.09),transparent_22%),radial-gradient(circle_at_80%_18%,rgba(146,230,207,0.06),transparent_23%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.012)),#050505] px-5 py-6 shadow-[0_22px_60px_rgba(0,0,0,0.26)] sm:px-8 sm:py-7 lg:px-9 lg:py-8'>
        <div className='relative z-10 mx-auto max-w-[38rem] text-center'>
          <h2 className='text-[clamp(2.35rem,6.1vw,4.85rem)] font-semibold leading-[0.92] tracking-[-0.075em] text-primary-token'>
            {howItWorks.headline}
          </h2>
          <p className='mx-auto mt-2.5 max-w-[37rem] rounded-full bg-white/[0.065] px-4 py-2 text-[15px] font-medium leading-[1.35] text-[rgba(255,255,255,0.94)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:text-base'>
            {howItWorks.body}
          </p>
        </div>

        <div className='relative z-10 mt-3.5 grid gap-5 lg:mt-4 lg:grid-cols-3 lg:gap-3'>
          {howItWorks.steps.map((step, index) => {
            const numberGradient =
              STEP_NUMBER_STYLES[index] ?? STEP_NUMBER_STYLES[0];

            return (
              <article
                key={step.id}
                className='relative flex flex-col items-center text-center'
              >
                {index < howItWorks.steps.length - 1 ? (
                  <ArrowRight
                    className='absolute right-[-1.1rem] top-[2.78rem] hidden h-6 w-6 text-white/55 lg:block'
                    strokeWidth={1.4}
                    aria-hidden='true'
                  />
                ) : null}
                {index > 0 ? (
                  <ArrowDown
                    className='absolute -top-6 h-5 w-5 text-white/32 lg:hidden'
                    strokeWidth={1.4}
                    aria-hidden='true'
                  />
                ) : null}

                <p
                  className={`bg-gradient-to-b ${numberGradient} bg-clip-text text-[clamp(5rem,15vw,7.25rem)] font-semibold leading-none tracking-[-0.105em] text-transparent drop-shadow-[0_0_22px_rgba(134,160,255,0.24)]`}
                >
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className='mt-1.5 text-[18px] font-semibold tracking-[-0.025em] text-primary-token'>
                  {step.title}
                </h3>
                <p className='mt-1.5 max-w-[18rem] text-[14px] leading-[1.5] text-secondary-token'>
                  {step.description}
                </p>
                <StepMoment stepId={step.id} />
              </article>
            );
          })}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
