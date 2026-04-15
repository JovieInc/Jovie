import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowRight, Link2, Search, Sparkles } from 'lucide-react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

const STEP_ICONS: Record<
  ArtistProfileLandingCopy['howItWorks']['steps'][number]['id'],
  LucideIcon
> = {
  claim: Search,
  connect: Sparkles,
  share: Link2,
};

const STEP_NUMBER_STYLES = [
  'from-[#bfe8ff] via-[#8bbcff] to-[#5f7cff]',
  'from-[#f4d7ff] via-[#c391ff] to-[#8c56ff]',
  'from-[#d3fff0] via-[#74e7bf] to-[#38bdf8]',
];

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell
      width='landing'
      className='bg-black py-12 sm:py-16 lg:py-20'
    >
      <div className='relative overflow-hidden rounded-[2.25rem] border border-white/[0.06] bg-[radial-gradient(circle_at_20%_18%,rgba(91,141,255,0.18),transparent_24%),radial-gradient(circle_at_76%_22%,rgba(190,112,255,0.13),transparent_25%),radial-gradient(circle_at_50%_100%,rgba(80,255,190,0.08),transparent_30%),#050505] px-5 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-16'>
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
          <p className='mx-auto mt-5 max-w-[25rem] text-[15px] leading-[1.65] text-secondary-token sm:text-base'>
            {howItWorks.body}
          </p>
        </div>

        <div className='relative z-10 mt-14 grid gap-10 lg:mt-20 lg:grid-cols-3 lg:gap-8'>
          {howItWorks.steps.map((step, index) => {
            const Icon = STEP_ICONS[step.id];
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
                <span
                  className='mt-7 flex h-8 w-8 items-center justify-center text-white/58'
                  aria-hidden='true'
                >
                  <Icon className='h-5 w-5' strokeWidth={1.65} />
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
