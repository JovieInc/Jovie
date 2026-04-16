import {
  Bell,
  Check,
  CreditCard,
  Dot,
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

export const AUDIENCE_RAIL_ACCENT_SEQUENCES = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [3, 6, 1, 4, 7, 2, 5, 0],
  [5, 0, 4, 1, 6, 3, 7, 2],
] as const;

export function getAudienceRailAccentIndex(
  railIndex: number,
  pillIndex: number
): number {
  const sequence =
    AUDIENCE_RAIL_ACCENT_SEQUENCES[
      railIndex % AUDIENCE_RAIL_ACCENT_SEQUENCES.length
    ] ?? AUDIENCE_RAIL_ACCENT_SEQUENCES[0];

  return sequence[pillIndex % sequence.length] ?? 0;
}

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
  railIndex,
}: Readonly<{
  direction: 'left' | 'right';
  pills: readonly ArtistProfileAudiencePill[];
  railIndex: number;
}>) {
  const repeatedPills = [
    ...pills.map(pill => ({ pill, repeat: 'first' as const })),
    ...pills.map(pill => ({ pill, repeat: 'second' as const })),
  ];

  return (
    <div
      className='artist-profile-audience-mask overflow-hidden py-1'
      aria-hidden='true'
    >
      <ul
        role='presentation'
        className={cn(
          'artist-profile-audience-rail flex w-max gap-3',
          direction === 'right' && 'artist-profile-audience-rail-reverse'
        )}
      >
        {repeatedPills.map(({ pill, repeat }, index) => (
          <AudiencePill
            key={`${repeat}-${pill.id}`}
            accentIndex={getAudienceRailAccentIndex(railIndex, index)}
            pill={pill}
          />
        ))}
      </ul>
    </div>
  );
}

const DEMO_SUBSCRIBE_EMAIL = 'ava@icloud.com';

export function ArtistProfileCaptureSection({
  capture,
}: Readonly<ArtistProfileCaptureSectionProps>) {
  return (
    <ArtistProfileSectionShell className='bg-white/[0.008] py-24 sm:py-28 lg:py-36'>
      <style>{`
        .artist-profile-audience-mask {
          mask-image: linear-gradient(90deg, transparent, black 7%, black 93%, transparent);
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
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.024)),
            rgba(5, 6, 8, 0.86);
          color: rgba(255, 255, 255, 0.94);
          font-size: 13px;
          font-weight: 500;
          line-height: 1;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -1px 0 rgba(255, 255, 255, 0.03),
            0 12px 28px rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(14px);
          transition: background 200ms ease, box-shadow 200ms ease;
        }

        .artist-profile-audience-pill:hover {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            inset 0 -1px 0 rgba(255, 255, 255, 0.04),
            0 14px 30px rgba(0, 0, 0, 0.24);
        }

        .artist-profile-audience-chip {
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.045);
          padding: 0.23rem 0.5rem;
          color: rgba(255, 255, 255, 0.7);
          font-size: 11px;
          font-weight: 600;
        }

        .artist-profile-audience-rail {
          animation: artist-profile-audience-drift 64s linear infinite;
        }

        .artist-profile-audience-rail-reverse {
          animation-direction: reverse;
          animation-duration: 72s;
        }

        .artist-profile-capture-shell:hover .artist-profile-audience-rail {
          animation-play-state: paused;
        }

        .artist-profile-subscribe-flow-input {
          animation: artist-profile-subscribe-flow-out 5.6s ease-in-out infinite;
        }

        .artist-profile-subscribe-flow-success {
          animation: artist-profile-subscribe-flow-in 5.6s ease-in-out infinite;
        }

        .artist-profile-subscribe-typed {
          width: 0ch;
          animation: artist-profile-subscribe-type 5.6s steps(15, end) infinite;
        }

        .artist-profile-subscribe-caret {
          animation:
            artist-profile-subscribe-caret-blink 0.9s steps(1, end) infinite,
            artist-profile-subscribe-caret-hide 5.6s linear infinite;
        }

        @keyframes artist-profile-audience-drift {
          from {
            transform: translate3d(0, 0, 0);
          }

          to {
            transform: translate3d(-50%, 0, 0);
          }
        }

        @keyframes artist-profile-subscribe-type {
          0%,
          10% {
            width: 0ch;
          }

          34%,
          100% {
            width: 15ch;
          }
        }

        @keyframes artist-profile-subscribe-flow-out {
          0%,
          38% {
            opacity: 1;
            transform: translateY(0);
          }

          50%,
          100% {
            opacity: 0;
            transform: translateY(-10px);
          }
        }

        @keyframes artist-profile-subscribe-flow-in {
          0%,
          40% {
            opacity: 0;
            transform: translateY(10px);
          }

          52%,
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes artist-profile-subscribe-caret-blink {
          0%,
          45%,
          100% {
            opacity: 1;
          }

          50% {
            opacity: 0;
          }
        }

        @keyframes artist-profile-subscribe-caret-hide {
          0%,
          40% {
            opacity: 1;
          }

          50%,
          100% {
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .artist-profile-audience-rail,
          .artist-profile-subscribe-flow-input,
          .artist-profile-subscribe-flow-success,
          .artist-profile-subscribe-typed,
          .artist-profile-subscribe-caret {
            animation: none;
          }

          .artist-profile-subscribe-flow-input {
            opacity: 0;
            transform: translateY(-10px);
          }

          .artist-profile-subscribe-flow-success {
            opacity: 1;
            transform: translateY(0);
          }

          .artist-profile-subscribe-typed {
            width: 15ch;
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

        <div className='relative mx-auto mt-14 max-w-[720px] overflow-hidden rounded-[1.7rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3 shadow-[0_24px_64px_rgba(0,0,0,0.3)] sm:p-4'>
          <div className='rounded-[1.35rem] bg-black/48 p-4 sm:p-5'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex min-w-0 items-center gap-3.5'>
                <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-primary-token'>
                  <Bell className='h-[18px] w-[18px]' strokeWidth={1.9} />
                </span>
                <div className='min-w-0 text-left'>
                  <p className='text-[15px] font-semibold leading-tight tracking-[-0.025em] text-primary-token'>
                    {capture.action.title}
                  </p>
                  <p className='mt-1 text-[12px] leading-snug tracking-[-0.01em] text-secondary-token'>
                    {capture.action.detail}
                  </p>
                </div>
              </div>
              <div className='relative h-12 w-full max-w-[23rem] shrink-0 sm:h-12'>
                <div
                  className='artist-profile-subscribe-flow-input absolute inset-0 flex items-center gap-2 rounded-full bg-white/[0.045] p-1.5 pl-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'
                  aria-hidden='true'
                >
                  <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-primary-token'>
                    <Mail className='h-4 w-4' strokeWidth={1.9} />
                  </span>
                  <span className='flex min-w-0 flex-1 items-center rounded-full bg-black/28 px-3 py-2'>
                    <span className='artist-profile-subscribe-typed inline-block overflow-hidden whitespace-nowrap font-mono text-[12px] font-medium tracking-[-0.02em] text-primary-token'>
                      {DEMO_SUBSCRIBE_EMAIL}
                    </span>
                    <span
                      className='artist-profile-subscribe-caret ml-0.5 inline-block h-3.5 w-px bg-white/58'
                      aria-hidden='true'
                    />
                  </span>
                  <span className='inline-flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-[13px] font-semibold tracking-[-0.02em] text-black'>
                    {capture.action.ctaLabel}
                  </span>
                </div>
                <div
                  className='artist-profile-subscribe-flow-success absolute inset-0 flex items-center gap-2 rounded-full bg-white/[0.05] p-1.5 pl-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]'
                  aria-hidden='true'
                >
                  <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black'>
                    <Check className='h-4 w-4' strokeWidth={2.1} />
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block text-[12px] font-semibold tracking-[-0.02em] text-primary-token'>
                      Subscribed
                    </span>
                    <span className='block text-[11px] tracking-[-0.01em] text-secondary-token'>
                      Notifications on
                    </span>
                  </span>
                  <span className='inline-flex h-9 shrink-0 items-center rounded-full bg-white px-3.5 text-[12px] font-semibold tracking-[-0.02em] text-black'>
                    Live
                  </span>
                </div>
                <p className='sr-only'>
                  A demo email is typed into the subscribe input, then the UI
                  switches to a subscribed state with notifications enabled.
                </p>
              </div>
            </div>
            <div className='mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 pt-2 text-[11px] font-medium tracking-[-0.01em] text-tertiary-token'>
              <span className='inline-flex items-center gap-1.5 rounded-full bg-white/[0.035] px-2.5 py-1'>
                <Check className='h-3 w-3 text-primary-token' strokeWidth={2} />
                {capture.action.confirmedLabel}
              </span>
              <span className='inline-flex items-center gap-1 text-secondary-token'>
                <Dot className='h-4 w-4 text-white/36' strokeWidth={3} />
                {capture.action.afterDetail}
              </span>
              <span className='inline-flex items-center gap-1 text-tertiary-token'>
                <Dot className='h-4 w-4 text-white/28' strokeWidth={3} />
                {capture.action.beforeDetail}
              </span>
              <p className='sr-only'>
                {capture.action.beforeLabel}: {capture.action.beforeTitle}.{' '}
                {capture.action.afterLabel}: {capture.action.afterTitle}.
              </p>
            </div>
          </div>
        </div>

        <div className='mt-9 space-y-3'>
          {capture.audienceRails.map((rail, index) => (
            <AudienceRail
              key={rail.map(pill => pill.id).join('-')}
              pills={rail}
              railIndex={index}
              direction={index % 2 === 0 ? 'left' : 'right'}
            />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
