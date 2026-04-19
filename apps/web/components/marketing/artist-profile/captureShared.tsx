import {
  Check,
  CreditCard,
  Headphones,
  Mail,
  MapPin,
  Play,
  QrCode,
  Radio,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type {
  ArtistProfileAudiencePill,
  ArtistProfileLandingCopy,
} from '@/data/artistProfileCopy';
import { ACCENT_ROTATION, getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';

export const AUDIENCE_ICON = {
  spotify: Radio,
  apple: Headphones,
  youtube: Play,
  qr: QrCode,
  shows: MapPin,
  subscribe: Check,
  music: Play,
  email: Mail,
  pay: CreditCard,
} as const;

export const PILL_ACCENTS = ACCENT_ROTATION.map(
  accent => getAccentCssVars(accent).solid
);

export const AUDIENCE_RAIL_ACCENT_SEQUENCES = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [3, 6, 1, 4, 7, 2, 5, 0],
  [5, 0, 4, 1, 6, 3, 7, 2],
] as const;

export const DEMO_SUBSCRIBE_EMAIL = 'ava@icloud.com';

export type CapturePhase = 'idle' | 'typing' | 'submitting' | 'done';

export type PillAccentStyle = CSSProperties & {
  readonly '--pill-accent': string;
};

export const CAPTURE_ANIMATION_STYLES = `
  .artist-profile-audience-mask {
    mask-image: linear-gradient(90deg, transparent, black 7%, black 93%, transparent);
  }

  .artist-profile-audience-pill {
    position: relative;
    isolation: isolate;
    display: flex;
    min-height: 3rem;
    max-width: min(21rem, calc(100vw - 4rem));
    flex-shrink: 0;
    align-items: center;
    overflow: hidden;
    border-radius: 9999px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.015)),
      rgba(5, 6, 8, 0.82);
    color: rgba(255, 255, 255, 0.92);
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.3;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      inset 0 -1px 0 rgba(255, 255, 255, 0.03),
      0 10px 24px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(14px);
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

  .artist-profile-capture-typed {
    width: 0ch;
    animation: artist-profile-capture-type 0.95s steps(15, end) forwards;
  }

  .artist-profile-capture-caret {
    animation: artist-profile-capture-caret 0.9s steps(1, end) infinite;
  }

  @keyframes artist-profile-audience-drift {
    from {
      transform: translate3d(0, 0, 0);
    }

    to {
      transform: translate3d(-50%, 0, 0);
    }
  }

  @keyframes artist-profile-capture-type {
    from {
      width: 0ch;
    }

    to {
      width: 15ch;
    }
  }

  @keyframes artist-profile-capture-caret {
    0%,
    45%,
    100% {
      opacity: 1;
    }

    50% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .artist-profile-audience-rail,
    .artist-profile-capture-typed,
    .artist-profile-capture-caret {
      animation: none;
    }

    .artist-profile-capture-typed {
      width: 15ch;
    }
  }
`;

export function CaptureActionPill({
  capture,
  phase,
}: Readonly<{
  capture: ArtistProfileLandingCopy['capture'];
  phase: CapturePhase;
}>) {
  const isTyping = phase === 'typing';
  const isSubmitting = phase === 'submitting';
  const isDone = phase === 'done';

  return (
    <div
      className='w-full max-w-[27rem] rounded-full border border-white/10 bg-white/[0.035] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl'
      aria-live='polite'
    >
      <div
        className={cn(
          'flex min-h-[4rem] items-center rounded-full px-2 py-1.5 transition-[background-color,transform,opacity] duration-300',
          isDone
            ? 'justify-center bg-white text-black'
            : 'gap-2 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]'
        )}
      >
        {isDone ? (
          <div className='flex items-center justify-center gap-2.5 px-3'>
            <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-black text-white'>
              <Check className='h-3.5 w-3.5' strokeWidth={2.4} />
            </span>
            <span className='text-[12.5px] font-semibold tracking-[-0.02em] text-black'>
              {capture.action.confirmedLabel}
            </span>
          </div>
        ) : (
          <>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-primary-token'>
              <Mail className='h-4 w-4' strokeWidth={1.9} />
            </span>

            <span className='flex min-w-0 flex-1 items-center rounded-full border border-white/8 bg-black/34 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'>
              {isTyping || isSubmitting ? (
                <>
                  <span className='artist-profile-capture-typed inline-block overflow-hidden whitespace-nowrap font-mono text-[12px] font-medium tracking-[-0.02em] text-primary-token'>
                    {DEMO_SUBSCRIBE_EMAIL}
                  </span>
                  {isTyping ? (
                    <span className='artist-profile-capture-caret ml-0.5 inline-block h-3.5 w-px bg-white/58' />
                  ) : null}
                </>
              ) : (
                <span className='text-[12px] font-medium tracking-[-0.02em] text-white/36'>
                  {capture.action.detail}
                </span>
              )}
            </span>

            <span
              className={cn(
                'rounded-full px-4 py-2.5 text-[12px] font-semibold tracking-[-0.02em] transition-all duration-300',
                isSubmitting
                  ? 'scale-[0.96] bg-white/88 text-black'
                  : 'bg-white text-black'
              )}
            >
              {capture.action.ctaLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function AudiencePill({
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
      <span className='relative z-10 flex items-center gap-2.5 px-4 py-3'>
        <Icon
          className='h-4 w-4 shrink-0 text-[color:var(--pill-accent)]'
          strokeWidth={1.9}
        />
        <span className='leading-[1.35] text-primary-token'>
          {pill.sentence}
        </span>
      </span>
    </li>
  );
}

export function AudienceRail({
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
