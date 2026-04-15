import {
  Bell,
  Check,
  Headphones,
  MapPin,
  Music2,
  Play,
  QrCode,
  Radio,
} from 'lucide-react';
import type {
  ArtistProfileAudiencePill,
  ArtistProfileLandingCopy,
} from '@/data/artistProfileCopy';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileCaptureSectionProps {
  readonly capture: ArtistProfileLandingCopy['capture'];
}

const AUDIENCE_ICON = {
  spotify: Radio,
  apple: Headphones,
  youtube: Play,
  qr: QrCode,
  shows: MapPin,
  subscribe: Check,
  music: Music2,
} as const;

function AudiencePill({
  pill,
}: Readonly<{
  pill: ArtistProfileAudiencePill;
}>) {
  const Icon = AUDIENCE_ICON[pill.icon];

  return (
    <li className='artist-profile-audience-pill group flex h-12 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.045] px-4 text-[13px] font-medium leading-none text-primary-token shadow-[0_0_34px_rgba(91,141,255,0.08)] backdrop-blur-xl transition-colors duration-200 hover:border-white/[0.16] hover:bg-white/[0.07]'>
      <Icon className='h-4 w-4 shrink-0 text-sky-200/75' strokeWidth={1.9} />
      <span>{pill.identity}</span>
      <span className='h-1 w-1 shrink-0 rounded-full bg-white/28' />
      {pill.chips.map(chip => (
        <span
          key={chip}
          className='rounded-full bg-[linear-gradient(135deg,rgba(116,170,255,0.18),rgba(166,119,255,0.16))] px-2 py-1 text-[11px] font-semibold text-sky-100 ring-1 ring-white/[0.08]'
        >
          {chip}
        </span>
      ))}
      <span className='text-secondary-token'>{pill.action}</span>
    </li>
  );
}

function AudienceRail({
  direction,
  pills,
}: Readonly<{
  direction: 'left' | 'right';
  pills: readonly ArtistProfileAudiencePill[];
}>) {
  const repeatedPills = [
    ...pills.map(pill => ({ pill, repeat: 'first' as const })),
    ...pills.map(pill => ({ pill, repeat: 'second' as const })),
  ];

  return (
    <div className='artist-profile-audience-mask overflow-hidden py-1'>
      <ul
        className={cn(
          'artist-profile-audience-rail flex w-max gap-3',
          direction === 'right' && 'artist-profile-audience-rail-reverse'
        )}
      >
        {repeatedPills.map(({ pill, repeat }) => (
          <AudiencePill key={`${repeat}-${pill.id}`} pill={pill} />
        ))}
      </ul>
    </div>
  );
}

export function ArtistProfileCaptureSection({
  capture,
}: Readonly<ArtistProfileCaptureSectionProps>) {
  return (
    <ArtistProfileSectionShell className='bg-white/[0.008] py-24 sm:py-28 lg:py-36'>
      <style>{`
        .artist-profile-audience-mask {
          mask-image: linear-gradient(90deg, transparent, black 9%, black 91%, transparent);
        }

        .artist-profile-audience-rail {
          animation: artist-profile-audience-drift 48s linear infinite;
        }

        .artist-profile-audience-rail-reverse {
          animation-direction: reverse;
          animation-duration: 56s;
        }

        .artist-profile-capture-shell:hover .artist-profile-audience-rail {
          animation-play-state: paused;
        }

        .artist-profile-capture-confirmed {
          animation: artist-profile-capture-confirm 5.8s ease-in-out infinite;
        }

        @keyframes artist-profile-audience-drift {
          from {
            transform: translate3d(0, 0, 0);
          }

          to {
            transform: translate3d(-50%, 0, 0);
          }
        }

        @keyframes artist-profile-capture-confirm {
          0%,
          28% {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }

          42%,
          82% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }

          100% {
            opacity: 0;
            transform: translateY(-4px) scale(0.995);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .artist-profile-audience-rail,
          .artist-profile-capture-confirmed {
            animation: none;
          }
        }
      `}</style>

      <div className='artist-profile-capture-shell mx-auto max-w-[1120px]'>
        <div className='mx-auto max-w-[43rem] text-center'>
          <h2 className='text-[clamp(3.5rem,8vw,7.25rem)] font-semibold leading-[0.9] tracking-[-0.08em] text-primary-token'>
            {capture.headline}
          </h2>
          <p className='mx-auto mt-5 max-w-[33rem] text-[clamp(1.15rem,2vw,1.55rem)] font-medium leading-[1.25] tracking-[-0.04em] text-secondary-token'>
            {capture.subhead}
          </p>
        </div>

        <div className='relative mx-auto mt-14 max-w-[820px] overflow-hidden rounded-[2rem] border border-white/[0.07] bg-[radial-gradient(circle_at_50%_0%,rgba(86,130,255,0.14),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-4 shadow-[0_32px_120px_rgba(0,0,0,0.46)] sm:p-5'>
          <div
            className='pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/40 to-transparent'
            aria-hidden='true'
          />
          <div className='rounded-[1.55rem] bg-black/48 p-4 ring-1 ring-white/[0.06] sm:p-5'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-3'>
                <span
                  className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sky-100 ring-1 ring-white/[0.08]'
                  aria-hidden='true'
                >
                  <Bell className='h-4 w-4' strokeWidth={1.9} />
                </span>
                <div>
                  <p className='text-[15px] font-semibold tracking-[-0.02em] text-primary-token'>
                    {capture.action.title}
                  </p>
                  <p className='mt-1 text-[12px] leading-none text-tertiary-token'>
                    {capture.action.detail}
                  </p>
                </div>
              </div>
              <div className='relative h-10 w-full sm:w-36'>
                <div className='absolute inset-0 rounded-full bg-white px-5 py-3 text-center text-[12px] font-semibold leading-none text-black'>
                  {capture.action.ctaLabel}
                </div>
                <div className='artist-profile-capture-confirmed absolute inset-0 flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,rgba(143,189,255,1),rgba(190,150,255,1))] px-5 text-[12px] font-semibold leading-none text-black shadow-[0_0_40px_rgba(121,154,255,0.3)]'>
                  <Check className='h-3.5 w-3.5' strokeWidth={2.2} />
                  {capture.action.confirmedLabel}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className='mt-9 space-y-3'>
          {capture.audienceRails.map((rail, index) => (
            <AudienceRail
              key={rail.map(pill => pill.id).join('-')}
              pills={rail}
              direction={index % 2 === 0 ? 'left' : 'right'}
            />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
