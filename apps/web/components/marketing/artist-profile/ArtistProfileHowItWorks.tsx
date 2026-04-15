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
  'from-[#fbf7ff] via-[#b8a2ff] to-[#6f8dff]',
  'from-[#f2fffb] via-[#92e6cf] to-[#5fa8ff]',
];

function ClaimMoment() {
  return (
    <div className='mt-6 w-full max-w-[17rem] text-left'>
      <div className='flex h-10 items-center gap-2 rounded-full bg-white/[0.055] px-3 text-[12px] text-secondary-token ring-1 ring-white/[0.08]'>
        <Search
          className='h-3.5 w-3.5 text-primary-token/72'
          strokeWidth={1.8}
        />
        <span className='font-medium text-primary-token'>Tim White</span>
      </div>
      <div className='mt-2 flex items-center gap-3 rounded-[1rem] bg-black/28 px-3 py-2.5 ring-1 ring-white/[0.07]'>
        <div
          className='h-8 w-8 rounded-full bg-[linear-gradient(135deg,#f6f9ff,#7fa3ff)]'
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[12px] font-semibold text-primary-token'>
            Tim White
          </p>
          <p className='text-[11px] text-tertiary-token'>
            Artist profile found
          </p>
        </div>
        <span className='rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-black'>
          Claim
        </span>
      </div>
    </div>
  );
}

function BuildMoment() {
  return (
    <div className='mt-6 w-full max-w-[17rem]'>
      <div className='flex flex-wrap justify-center gap-1.5'>
        {['Spotify', 'Apple', 'YouTube', 'Deezer'].map(provider => (
          <span
            key={provider}
            className='rounded-full bg-white/[0.055] px-2.5 py-1 text-[10px] font-semibold text-secondary-token ring-1 ring-white/[0.07]'
          >
            {provider}
          </span>
        ))}
      </div>
      <div className='mt-3 rounded-[1rem] bg-black/28 px-3 py-3 ring-1 ring-white/[0.07]'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-[11px] font-medium text-primary-token'>
            Importing catalog
          </span>
          <span className='flex items-center gap-1.5 text-[10px] font-semibold text-sky-100'>
            <Check className='h-3 w-3' strokeWidth={2} />
            27+ providers
          </span>
        </div>
        <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]'>
          <div className='h-full w-[82%] rounded-full bg-[linear-gradient(90deg,#9cb9ff,#92e6cf)]' />
        </div>
      </div>
    </div>
  );
}

function ShareMoment() {
  return (
    <div className='mt-6 w-full max-w-[17rem]'>
      <div className='flex items-center justify-between gap-3 rounded-full bg-white/[0.055] px-3 py-2.5 ring-1 ring-white/[0.08]'>
        <span className='font-mono text-[11px] text-secondary-token'>
          jov.ie/timwhite
        </span>
        <span className='flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-black'>
          <Copy className='h-3 w-3' strokeWidth={2} />
          Copied
        </span>
      </div>
      <div className='mt-2 flex items-center justify-center gap-2'>
        <span className='flex h-9 w-9 items-center justify-center rounded-[0.7rem] bg-black/28 text-primary-token ring-1 ring-white/[0.07]'>
          <QrCode className='h-4 w-4' strokeWidth={1.8} />
        </span>
        {['Bio', 'Stories', 'QR', 'Shows'].map(channel => (
          <span
            key={channel}
            className='rounded-full bg-white/[0.045] px-2 py-1 text-[10px] font-semibold text-tertiary-token ring-1 ring-white/[0.06]'
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
      className='bg-black py-12 sm:py-16 lg:py-20'
    >
      <div className='relative overflow-hidden rounded-[2.25rem] border border-white/[0.06] bg-[radial-gradient(circle_at_20%_18%,rgba(101,119,255,0.16),transparent_24%),radial-gradient(circle_at_76%_22%,rgba(146,230,207,0.1),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(95,168,255,0.08),transparent_30%),#050505] px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-14'>
        <div
          className='pointer-events-none absolute left-[7%] top-[18%] h-1.5 w-1.5 rounded-full bg-white/60 shadow-[0_0_18px_rgba(255,255,255,0.65)]'
          aria-hidden='true'
        />
        <div
          className='pointer-events-none absolute right-[13%] top-[16%] h-12 w-px rotate-45 bg-gradient-to-b from-transparent via-white/30 to-transparent'
          aria-hidden='true'
        />
        <div
          className='pointer-events-none absolute bottom-[18%] left-[48%] h-10 w-px -rotate-45 bg-gradient-to-b from-transparent via-white/20 to-transparent'
          aria-hidden='true'
        />

        <div className='relative z-10 mx-auto max-w-[38rem] text-center'>
          <h2 className='text-[clamp(2.4rem,7vw,5.5rem)] font-semibold leading-[0.92] tracking-[-0.075em] text-primary-token'>
            {howItWorks.headline}
          </h2>
          <p className='mx-auto mt-4 max-w-[36rem] text-[15px] leading-[1.55] text-secondary-token sm:text-base'>
            {howItWorks.body}
          </p>
        </div>

        <div className='relative z-10 mt-10 grid gap-9 lg:mt-14 lg:grid-cols-3 lg:gap-7'>
          {howItWorks.steps.map((step, index) => {
            const numberGradient =
              STEP_NUMBER_STYLES[index] ?? STEP_NUMBER_STYLES[0];

            return (
              <article
                key={step.id}
                className='relative flex flex-col items-center text-center'
              >
                {index < howItWorks.steps.length - 1 ? (
                  <>
                    <div
                      className='pointer-events-none absolute left-1/2 top-[4.2rem] hidden h-px w-[calc(100%-2rem)] translate-x-1/2 bg-gradient-to-r from-white/22 via-white/12 to-transparent lg:block'
                      aria-hidden='true'
                    />
                    <ArrowRight
                      className='absolute right-[-1.5rem] top-[3.3rem] hidden h-6 w-6 text-white/55 lg:block'
                      strokeWidth={1.4}
                      aria-hidden='true'
                    />
                  </>
                ) : null}
                {index > 0 ? (
                  <ArrowDown
                    className='absolute -top-7 h-5 w-5 text-white/32 lg:hidden'
                    strokeWidth={1.4}
                    aria-hidden='true'
                  />
                ) : null}

                <p
                  className={`bg-gradient-to-b ${numberGradient} bg-clip-text text-[clamp(5.5rem,18vw,8.5rem)] font-semibold leading-none tracking-[-0.105em] text-transparent drop-shadow-[0_0_28px_rgba(134,160,255,0.28)]`}
                >
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className='mt-7 text-[18px] font-semibold tracking-[-0.025em] text-primary-token'>
                  {step.title}
                </h3>
                <p className='mt-3 max-w-[18rem] text-[14px] leading-[1.6] text-secondary-token'>
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
