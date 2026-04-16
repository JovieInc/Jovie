import {
  ArrowRight,
  Bell,
  Check,
  CreditCard,
  Headphones,
  Mail,
  MapPin,
  Music2,
  Play,
  QrCode,
  Radio,
} from 'lucide-react';
import type { CSSProperties } from 'react';
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
  email: Mail,
  pay: CreditCard,
} as const;

const PILL_ACCENTS = [
  'var(--color-accent-blue)',
  'var(--color-accent-purple)',
  'var(--color-accent-pink)',
  'var(--color-accent-red)',
  'var(--color-accent-orange)',
  'var(--color-accent-green)',
  'var(--color-accent-teal)',
  'var(--color-accent-gray)',
] as const;

type PillAccentStyle = CSSProperties & {
  readonly '--pill-accent': string;
};

function AudiencePill({
  accentIndex,
  pill,
}: Readonly<{
  accentIndex: number;
  pill: ArtistProfileAudiencePill;
}>) {
  const Icon = AUDIENCE_ICON[pill.icon];
  const style: PillAccentStyle = {
    '--pill-accent': PILL_ACCENTS[accentIndex % PILL_ACCENTS.length],
  };

  return (
    <li className='artist-profile-audience-pill group' style={style}>
      <span className='relative z-10 flex h-full items-center gap-2.5 px-4'>
        <Icon
          className='h-4 w-4 shrink-0 text-[color:var(--pill-accent)]'
          strokeWidth={1.9}
        />
        <span>{pill.identity}</span>
        {pill.chips.map(chip => (
          <span key={chip} className='artist-profile-audience-chip'>
            {chip}
          </span>
        ))}
        <span className='text-secondary-token'>{pill.action}</span>
      </span>
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
        {repeatedPills.map(({ pill, repeat }, index) => (
          <AudiencePill
            key={`${repeat}-${pill.id}`}
            accentIndex={index}
            pill={pill}
          />
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

        .artist-profile-audience-pill {
          position: relative;
          isolation: isolate;
          display: flex;
          height: 3rem;
          flex-shrink: 0;
          align-items: center;
          overflow: hidden;
          white-space: nowrap;
          border-radius: 9999px;
          border: 1px solid color-mix(in srgb, var(--pill-accent) 24%, rgba(255, 255, 255, 0.12));
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.052), rgba(255, 255, 255, 0.026)),
            color-mix(in srgb, var(--pill-accent) 5%, rgba(0, 0, 0, 0.72));
          color: rgba(255, 255, 255, 0.94);
          font-size: 13px;
          font-weight: 500;
          line-height: 1;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 14px 34px rgba(0, 0, 0, 0.24);
          backdrop-filter: blur(18px);
          transition:
            border-color 200ms ease,
            background 200ms ease,
            box-shadow 200ms ease;
        }

        .artist-profile-audience-pill::before {
          position: absolute;
          inset: -1px;
          z-index: 0;
          padding: 1px;
          border-radius: inherit;
          background:
            conic-gradient(
              from 0deg,
              transparent 0deg,
              transparent 58deg,
              color-mix(in srgb, var(--pill-accent) 18%, transparent) 74deg,
              color-mix(in srgb, var(--pill-accent) 88%, white 12%) 92deg,
              rgba(255, 255, 255, 0.86) 104deg,
              color-mix(in srgb, var(--pill-accent) 86%, white 14%) 116deg,
              transparent 138deg,
              transparent 360deg
            );
          content: '';
          opacity: 0.72;
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          mask-composite: exclude;
          animation: artist-profile-electric-border 5.4s linear infinite;
        }

        .artist-profile-audience-pill::after {
          position: absolute;
          inset: 1px;
          z-index: 0;
          border-radius: inherit;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--pill-accent) 12%, transparent), transparent 50%),
            rgba(0, 0, 0, 0.32);
          content: '';
        }

        .artist-profile-audience-pill:hover {
          border-color: color-mix(in srgb, var(--pill-accent) 42%, rgba(255, 255, 255, 0.18));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 16px 38px rgba(0, 0, 0, 0.28),
            0 0 24px color-mix(in srgb, var(--pill-accent) 12%, transparent);
        }

        .artist-profile-audience-pill:hover::before {
          opacity: 0.95;
          animation-duration: 3.8s;
        }

        .artist-profile-audience-chip {
          border-radius: 9999px;
          border: 1px solid color-mix(in srgb, var(--pill-accent) 22%, rgba(255, 255, 255, 0.11));
          background: color-mix(in srgb, var(--pill-accent) 10%, rgba(255, 255, 255, 0.045));
          padding: 0.25rem 0.5rem;
          color: color-mix(in srgb, var(--pill-accent) 72%, white 28%);
          font-size: 11px;
          font-weight: 650;
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

        .artist-profile-capture-after {
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

        @keyframes artist-profile-electric-border {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes artist-profile-capture-confirm {
          0% {
            transform: translateY(0) scale(1);
          }

          50% {
            transform: translateY(-2px) scale(1.006);
          }

          100% {
            transform: translateY(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .artist-profile-audience-rail,
          .artist-profile-audience-pill::before,
          .artist-profile-capture-after {
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

        <div className='relative mx-auto mt-14 max-w-[820px] overflow-hidden rounded-[2rem] border border-white/[0.09] bg-[radial-gradient(circle_at_50%_0%,rgba(86,130,255,0.085),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.018))] p-4 shadow-[0_32px_90px_rgba(0,0,0,0.38)] sm:p-5'>
          <div
            className='pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/28 to-transparent'
            aria-hidden='true'
          />
          <div className='rounded-[1.55rem] bg-black/52 p-4 ring-1 ring-white/[0.08] sm:p-5'>
            <div className='grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch'>
              <div className='rounded-[1.2rem] border border-white/[0.09] bg-white/[0.035] p-4'>
                <p className='text-[12px] font-semibold tracking-[-0.01em] text-tertiary-token'>
                  {capture.action.beforeLabel}
                </p>
                <div className='mt-4 flex items-center gap-3'>
                  <span
                    className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.045] text-white/55 ring-1 ring-white/[0.08]'
                    aria-hidden='true'
                  >
                    <Music2 className='h-4 w-4' strokeWidth={1.9} />
                  </span>
                  <div className='min-w-0'>
                    <p className='truncate text-[14px] font-semibold tracking-[-0.02em] text-primary-token'>
                      {capture.action.beforeTitle}
                    </p>
                    <p className='mt-1 text-[12px] leading-snug text-tertiary-token'>
                      {capture.action.beforeDetail}
                    </p>
                  </div>
                </div>
              </div>

              <div className='hidden items-center justify-center px-1 md:flex'>
                <span
                  className='flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.045] text-sky-100/72'
                  aria-hidden='true'
                >
                  <ArrowRight className='h-4 w-4' strokeWidth={1.9} />
                </span>
              </div>

              <div className='artist-profile-capture-after rounded-[1.2rem] border border-sky-100/[0.2] bg-[linear-gradient(135deg,rgba(111,162,255,0.1),rgba(180,137,255,0.085))] p-4 shadow-[0_0_38px_rgba(97,135,255,0.12)]'>
                <div className='flex items-center justify-between gap-3'>
                  <p className='text-[12px] font-semibold tracking-[-0.01em] text-sky-100/72'>
                    {capture.action.afterLabel}
                  </p>
                  <span className='rounded-full bg-sky-100/12 px-2 py-1 text-[10px] font-semibold text-sky-100/82 ring-1 ring-sky-100/14'>
                    {capture.action.confirmedLabel}
                  </span>
                </div>
                <div className='mt-4 flex items-center gap-3'>
                  <span
                    className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100/12 text-sky-100 ring-1 ring-sky-100/16'
                    aria-hidden='true'
                  >
                    <Bell className='h-4 w-4' strokeWidth={1.9} />
                  </span>
                  <div className='min-w-0'>
                    <p className='truncate text-[14px] font-semibold tracking-[-0.02em] text-primary-token'>
                      {capture.action.afterTitle}
                    </p>
                    <p className='mt-1 text-[12px] leading-snug text-secondary-token'>
                      {capture.action.afterDetail}
                    </p>
                  </div>
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
