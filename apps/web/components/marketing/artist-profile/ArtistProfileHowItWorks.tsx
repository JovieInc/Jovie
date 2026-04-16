import { Copy, QrCode, Search } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

const WIDGET_ACCENTS = [
  'var(--color-accent-blue)',
  'var(--color-accent-teal)',
  'var(--color-accent-orange)',
] as const;

const PROVIDER_CHIPS = ['Spotify', 'Apple', 'YouTube', 'TikTok'] as const;
const SHARE_CHANNEL_BADGES = ['Bio', 'Stories', 'QR'] as const;

type StepAccentStyle = CSSProperties & {
  readonly '--step-accent': string;
};

function ClaimMoment({ accent }: Readonly<{ accent: string }>) {
  const style: StepAccentStyle = { '--step-accent': accent };

  return (
    <div
      className='w-full max-w-[23rem] rounded-[1.4rem] border border-white/7 bg-white/[0.03] p-4 text-left shadow-[0_18px_36px_rgba(0,0,0,0.22)] sm:p-[1.15rem]'
      style={style}
    >
      <div className='flex h-14 items-center gap-3 rounded-full bg-white/[0.055] px-4 text-[13px] text-secondary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'>
        <Search
          className='h-4 w-4 text-[color:var(--step-accent)]'
          strokeWidth={1.8}
        />
        <span className='text-tertiary-token'>Search artist</span>
        <span className='ml-auto font-medium text-primary-token'>
          Tim White
        </span>
      </div>
      <div className='mt-3.5 flex items-center gap-3 rounded-[1.1rem] bg-white/[0.04] px-3.5 py-3.5'>
        <div
          className='h-12 w-12 rounded-full'
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(208,216,255,0.86))',
          }}
          aria-hidden='true'
        />
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[13px] font-semibold text-primary-token'>
            Tim White
          </p>
          <p className='text-[11px] text-tertiary-token'>Spotify artist</p>
        </div>
        <span className='rounded-full bg-white px-3.5 py-2 text-[11px] font-semibold text-black'>
          Claim
        </span>
      </div>
    </div>
  );
}

function BuildMoment({ accent }: Readonly<{ accent: string }>) {
  const style: StepAccentStyle = { '--step-accent': accent };

  return (
    <div
      className='w-full max-w-[23rem] rounded-[1.4rem] border border-white/7 bg-white/[0.03] p-4 text-left shadow-[0_18px_36px_rgba(0,0,0,0.22)] sm:p-[1.15rem]'
      style={style}
    >
      <div className='flex flex-wrap gap-2.5'>
        {PROVIDER_CHIPS.map(provider => (
          <span
            key={provider}
            className='rounded-full px-3 py-1.5 text-[11px] font-medium text-secondary-token'
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {provider}
          </span>
        ))}
      </div>
      <div className='mt-3.5 rounded-[1.1rem] bg-white/[0.035] px-4 py-4'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-[12px] font-semibold text-primary-token'>
            Importing
          </span>
          <span className='text-[11px] font-medium text-primary-token/78'>
            86%
          </span>
        </div>
        <div className='mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]'>
          <div
            className='h-full w-[86%] rounded-full'
            style={{
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--step-accent) 72%, white), var(--step-accent))',
              boxShadow:
                '0 0 14px color-mix(in srgb, var(--step-accent) 28%, transparent)',
            }}
          />
        </div>
        <p className='mt-3 text-[11px] font-medium tracking-[0.03em] text-tertiary-token'>
          27+ providers
        </p>
      </div>
    </div>
  );
}

function ShareMoment({ accent }: Readonly<{ accent: string }>) {
  const style: StepAccentStyle = { '--step-accent': accent };

  return (
    <div
      className='w-full max-w-[23rem] rounded-[1.4rem] border border-white/7 bg-white/[0.03] p-4 text-left shadow-[0_18px_36px_rgba(0,0,0,0.22)] sm:p-[1.15rem]'
      style={style}
    >
      <div className='flex items-center justify-between gap-3 rounded-full bg-white/[0.055] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'>
        <span className='font-mono text-[12px] text-secondary-token'>
          jov.ie/timwhite
        </span>
        <span className='flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-semibold text-black'>
          <Copy
            className='h-3.5 w-3.5 text-[color:var(--step-accent)]'
            strokeWidth={2}
          />
          Copy
        </span>
      </div>
      <div className='mt-3.5 flex flex-wrap gap-2.5'>
        {SHARE_CHANNEL_BADGES.map(channel => {
          const isQr = channel === 'QR';

          return (
            <span
              key={channel}
              className='inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-secondary-token'
              style={{
                background: 'rgba(255,255,255,0.035)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {isQr ? (
                <QrCode className='h-3.5 w-3.5 text-[color:var(--step-accent)]' />
              ) : null}
              {channel}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function StepMoment({
  stepId,
  accent,
}: Readonly<{
  stepId: ArtistProfileLandingCopy['howItWorks']['steps'][number]['id'];
  accent: string;
}>) {
  if (stepId === 'claim') return <ClaimMoment accent={accent} />;
  if (stepId === 'connect') return <BuildMoment accent={accent} />;
  return <ShareMoment accent={accent} />;
}

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell
      width='page'
      className='bg-black py-12 sm:py-14 lg:py-16'
    >
      <div
        className='relative overflow-hidden rounded-[1.6rem] px-5 py-6 shadow-[0_22px_60px_rgba(0,0,0,0.26)] sm:px-8 sm:py-7 lg:px-9 lg:py-8'
        style={{
          background:
            'radial-gradient(circle_at_50%_0%, rgba(255,255,255,0.05), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)), #050505',
        }}
      >
        <div className='relative z-10 mx-auto max-w-[34rem] text-center'>
          <h2 className='text-[clamp(2.35rem,6.1vw,4.85rem)] font-semibold leading-[0.92] tracking-[-0.075em] text-primary-token'>
            {howItWorks.headline}
          </h2>
          {howItWorks.body ? (
            <p className='mt-2 text-[13px] font-medium tracking-[0.06em] text-white/48 sm:text-[14px]'>
              {howItWorks.body}
            </p>
          ) : null}
        </div>

        <div className='relative z-10 mx-auto mt-4 grid max-w-[1120px] gap-5 lg:grid-cols-3 lg:gap-6'>
          {howItWorks.steps.map((step, index) => {
            const accent = WIDGET_ACCENTS[index] ?? WIDGET_ACCENTS[0];

            return (
              <article
                key={step.id}
                className='relative flex flex-col items-center text-center'
              >
                <p
                  className='text-[clamp(4.75rem,14vw,7rem)] font-semibold leading-none tracking-[-0.1em] text-transparent'
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.98), color-mix(in srgb, ${accent} 62%, white))`,
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    textShadow: '0 0 18px rgba(255,255,255,0.05)',
                  }}
                >
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className='mt-0.5 text-[17px] font-semibold tracking-[-0.025em] text-primary-token'>
                  {step.title}
                </h3>
                <div className='mt-2.5 w-full'>
                  <StepMoment stepId={step.id} accent={accent} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
