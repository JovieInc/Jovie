import { Copy, QrCode, Search } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import {
  type AccentPaletteName,
  getAccentCssVars,
} from '@/lib/ui/accent-palette';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

const WIDGET_ACCENTS = [
  'blue',
  'green',
  'purple',
] as const satisfies readonly AccentPaletteName[];
const PROVIDER_ROWS = [
  {
    name: 'Spotify',
    accent: 'green',
    status: 'Matched',
  },
  {
    name: 'Apple Music',
    accent: 'gray',
    status: 'Matched',
  },
  {
    name: 'Deezer',
    accent: 'purple',
    status: 'Ingesting',
  },
] as const;
const SHARE_CHANNEL_BADGES = ['Bio', 'Stories', 'QR'] as const;

type StepAccentStyle = CSSProperties & {
  readonly '--step-accent': string;
  readonly '--step-accent-subtle'?: string;
};

function ClaimMoment({ accent }: Readonly<{ accent: string }>) {
  const style: StepAccentStyle = {
    '--step-accent': accent,
    '--step-accent-subtle': accent,
  };

  return (
    <div className='w-full max-w-[23rem] text-left' style={style}>
      <div className='flex h-14 items-center gap-3 rounded-full border border-white/10 bg-white/[0.045] px-4 text-[13px] text-secondary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'>
        <Search
          className='h-4 w-4 text-[color:var(--step-accent)]'
          strokeWidth={1.8}
        />
        <span className='font-medium text-primary-token'>Tim White</span>
      </div>
      <div className='mt-3 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02)),#090c10] p-2 shadow-[0_18px_36px_rgba(0,0,0,0.22)]'>
        <p className='px-2.5 pb-2 text-[10px] font-medium tracking-[0.08em] text-white/64'>
          Top results
        </p>
        <div className='rounded-[1rem] border border-white/8 bg-white/[0.05] px-3 py-3'>
          <div className='flex items-center gap-3'>
            <div
              className='h-11 w-11 rounded-full'
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
            <span className='rounded-full bg-[color:var(--step-accent)]/14 px-3 py-1.5 text-[10px] font-semibold text-[color:var(--step-accent)]'>
              Top result
            </span>
          </div>
        </div>
        <div className='mt-2 flex items-center gap-3 rounded-[1rem] px-3 py-2.5 opacity-62'>
          <div
            className='h-8 w-8 rounded-full bg-white/10'
            aria-hidden='true'
          />
          <div>
            <p className='text-[12px] font-medium text-primary-token'>
              Tim White Live Sessions
            </p>
            <p className='text-[10px] text-tertiary-token'>Artist page</p>
          </div>
        </div>
      </div>
      <div className='mt-3 flex items-center justify-between rounded-[1rem] border border-white/8 bg-white/[0.028] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'>
        <div>
          <p className='text-[13px] font-semibold text-primary-token'>
            Tim White
          </p>
          <p className='text-[11px] text-tertiary-token'>Ready to claim</p>
        </div>
        <span className='rounded-full bg-white px-3.5 py-2 text-[11px] font-semibold text-black'>
          Claim
        </span>
      </div>
    </div>
  );
}

function BuildMoment({ accent }: Readonly<{ accent: string }>) {
  const style: StepAccentStyle = {
    '--step-accent': accent,
    '--step-accent-subtle': accent,
  };

  return (
    <div
      className='w-full max-w-[23rem] rounded-[1.35rem] border border-white/8 bg-white/[0.022] p-4 text-left shadow-[0_18px_36px_rgba(0,0,0,0.22)] sm:p-[1.15rem]'
      style={style}
    >
      <div className='rounded-[1.1rem] bg-white/[0.035] px-4 py-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <span className='text-[12px] font-semibold text-primary-token'>
              Importing
            </span>
            <p className='mt-1 text-[11px] text-tertiary-token'>
              Pulling the profile into place
            </p>
          </div>
          <span className='text-[11px] font-medium text-primary-token/78'>
            86%
          </span>
        </div>
        <div className='mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.08]'>
          <div
            className='artist-profile-sync-progress h-full w-[86%] rounded-full'
            style={{
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--step-accent) 48%, white), var(--step-accent), color-mix(in srgb, var(--step-accent) 70%, white))',
              boxShadow:
                '0 0 18px color-mix(in srgb, var(--step-accent) 30%, transparent)',
            }}
          />
        </div>
      </div>
      <div className='mt-3.5 space-y-2.5'>
        {PROVIDER_ROWS.map(provider => {
          const providerAccent = getAccentCssVars(provider.accent).solid;
          const providerBorderColor = `color-mix(in srgb, ${providerAccent} 38%, transparent)`;
          const isIngesting = provider.status === 'Ingesting';

          return (
            <div
              key={provider.name}
              className='flex items-center justify-between rounded-[1rem] border border-white/8 bg-white/[0.03] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
            >
              <div className='flex items-center gap-3'>
                <span
                  className='inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white'
                  style={{
                    background: `color-mix(in srgb, ${providerAccent} 80%, black)`,
                    boxShadow: `0 0 0 1px color-mix(in srgb, ${providerAccent} 22%, transparent)`,
                  }}
                >
                  {provider.name.charAt(0)}
                </span>
                <p className='text-[13px] font-medium text-primary-token'>
                  {provider.name}
                </p>
              </div>
              <span
                className='rounded-full px-3 py-1.5 text-[10px] font-semibold'
                style={{
                  background: isIngesting
                    ? 'rgba(0,0,0,0.34)'
                    : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isIngesting ? providerBorderColor : 'rgba(255,255,255,0.08)'}`,
                  color: isIngesting
                    ? `color-mix(in srgb, ${providerAccent} 72%, white)`
                    : 'rgba(255,255,255,0.74)',
                }}
              >
                {provider.status}
              </span>
            </div>
          );
        })}
      </div>
      <p className='mt-3 text-[11px] font-medium tracking-[0.03em] text-tertiary-token'>
        And 24 others.
      </p>
    </div>
  );
}

function ShareMoment({ accent }: Readonly<{ accent: string }>) {
  const style: StepAccentStyle = { '--step-accent': accent };

  return (
    <div
      className='w-full max-w-[23rem] rounded-[1.35rem] border border-white/8 bg-white/[0.022] p-4 text-left shadow-[0_18px_36px_rgba(0,0,0,0.22)] sm:p-[1.15rem]'
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
      className='bg-black py-24 sm:py-28 lg:py-32'
    >
      <style>{`
        .artist-profile-sync-progress {
          animation: artist-profile-sync-progress 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite alternate;
        }

        @keyframes artist-profile-sync-progress {
          from {
            width: 32%;
            filter: saturate(0.9) brightness(0.94);
          }

          to {
            width: 86%;
            filter: saturate(1.08) brightness(1.03);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .artist-profile-sync-progress {
            animation: none;
            width: 86%;
          }
        }
      `}</style>
      <div
        className='relative overflow-hidden rounded-[1.9rem] px-5 py-9 shadow-[0_22px_60px_rgba(0,0,0,0.26)] sm:px-8 sm:py-10 lg:px-10 lg:py-12'
        style={{
          background:
            'radial-gradient(circle_at_50%_0%, rgba(255,255,255,0.05), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)), #050505',
        }}
      >
        <ArtistProfileSectionHeader
          align='center'
          headline={howItWorks.headline}
          body={howItWorks.body}
          className='relative z-10 mx-auto max-w-[40rem]'
          bodyClassName='mx-auto max-w-[30rem]'
          headlineClassName='text-[clamp(2.7rem,5vw,4.3rem)]'
        />

        <div className='relative z-10 mx-auto mt-10 grid max-w-[1120px] gap-8 lg:grid-cols-3 lg:gap-9'>
          {howItWorks.steps.map((step, index) => {
            const accentName = WIDGET_ACCENTS[index] ?? WIDGET_ACCENTS[0];
            const accent = getAccentCssVars(accentName).solid;

            return (
              <article
                key={step.id}
                className='relative flex flex-col items-center'
              >
                <div className='mx-auto flex w-full max-w-[23rem] items-start gap-3 text-left'>
                  <span className='pt-0.5 text-[13px] font-semibold tracking-[-0.03em] text-white/60'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className='min-w-0'>
                    <h3 className='text-[17px] font-semibold tracking-[-0.03em] text-primary-token'>
                      {step.title}
                    </h3>
                    <p className='mt-1.5 text-[13px] leading-[1.6] text-secondary-token'>
                      {step.description}
                    </p>
                  </div>
                </div>
                <div className='mt-5 w-full'>
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
