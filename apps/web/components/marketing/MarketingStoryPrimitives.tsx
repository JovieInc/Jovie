'use client';

import {
  ArrowRight,
  AtSign,
  BellRing,
  Check,
  CreditCard,
  Headphones,
  Mail,
  MailCheck,
  MapPin,
  Play,
  QrCode,
  Radio,
  Sparkles,
  Ticket,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ArtistNotificationsLandingCopy } from '@/data/artistNotificationsCopy';
import type {
  ArtistProfileAudiencePill,
  ArtistProfileLandingCopy,
} from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ACCENT_ROTATION, getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';

const NOTIFICATION_CARD_ICONS = {
  capture: AtSign,
  subscribe: Mail,
  email: MailCheck,
  click: Headphones,
  outcome: Ticket,
} as const;

const AUDIENCE_ICON = {
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

const OUTPUT_ICONS = {
  'release-alerts': Mail,
  'nearby-show-alerts': BellRing,
  'thank-you': Sparkles,
} as const;

const OUTPUT_ACCENTS = {
  'release-alerts': getAccentCssVars('purple').solid,
  'nearby-show-alerts': getAccentCssVars('orange').solid,
  'thank-you': getAccentCssVars('teal').solid,
} as const;

const PILL_ACCENTS = ACCENT_ROTATION.map(
  accent => getAccentCssVars(accent).solid
);

const AUDIENCE_RAIL_ACCENT_SEQUENCES = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [3, 6, 1, 4, 7, 2, 5, 0],
  [5, 0, 4, 1, 6, 3, 7, 2],
] as const;

const DEMO_SUBSCRIBE_EMAIL = 'ava@icloud.com';

type CapturePhase = 'idle' | 'typing' | 'submitting' | 'done';

type PillAccentStyle = CSSProperties & {
  readonly '--pill-accent': string;
};

type WorkflowTone = 'audience' | 'default' | 'destination' | 'message';

export type ArtistNotificationFloatingCard =
  ArtistNotificationsLandingCopy['hero']['floatingCards'][number];

export function ArtistNotificationFloatingCardView({
  card,
  className,
}: Readonly<{
  card: ArtistNotificationFloatingCard;
  className?: string;
}>) {
  const Icon = NOTIFICATION_CARD_ICONS[card.kind];

  if (card.kind === 'subscribe') {
    return (
      <div
        className={cn(
          'rounded-[1.1rem] bg-white/[0.028] p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.26)]',
          className
        )}
      >
        <div className='flex items-center gap-2 rounded-full bg-black/34 py-1 pl-3 pr-1'>
          <Mail
            className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
            strokeWidth={1.9}
          />
          <span className='min-w-0 flex-1 truncate text-[13px] text-secondary-token'>
            {card.detail}
          </span>
          <span className='inline-flex h-7 shrink-0 items-center rounded-full bg-white px-3 text-[12px] font-medium text-black'>
            {card.title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <article
      className={cn(
        'rounded-[1.1rem] bg-white/[0.028] p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.26)]',
        className
      )}
    >
      <div className='flex items-start gap-3'>
        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-primary-token'>
          <Icon className='h-4 w-4' strokeWidth={1.9} />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='text-[14px] font-semibold leading-[1.35] tracking-[-0.02em] text-primary-token'>
            {card.title}
          </p>
          {card.detail ? (
            <p className='mt-1.5 text-[13px] leading-[1.5] text-secondary-token'>
              {card.detail}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ArtistProfileCaptureVisual({
  capture,
  className,
}: Readonly<{
  capture: ArtistProfileLandingCopy['capture'];
  className?: string;
}>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [activated, setActivated] = useState(reducedMotion);
  const [phase, setPhase] = useState<CapturePhase>(
    reducedMotion ? 'done' : 'idle'
  );

  useEffect(() => {
    if (reducedMotion) {
      setActivated(true);
      setPhase('done');
      return;
    }

    const root = rootRef.current;
    if (!root || globalThis.IntersectionObserver === undefined) {
      setActivated(true);
      setPhase('typing');
      return;
    }

    const observer = new globalThis.IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }

        setActivated(true);
        setPhase(currentPhase =>
          currentPhase === 'idle' ? 'typing' : currentPhase
        );
        observer.disconnect();
      },
      {
        threshold: 0.55,
      }
    );

    observer.observe(root);

    return () => {
      observer.disconnect();
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!activated || reducedMotion || phase !== 'typing') {
      return;
    }

    const submitTimer = globalThis.setTimeout(() => {
      setPhase('submitting');
    }, 1200);

    return () => {
      globalThis.clearTimeout(submitTimer);
    };
  }, [activated, phase, reducedMotion]);

  useEffect(() => {
    if (!activated || reducedMotion || phase !== 'submitting') {
      return;
    }

    const finishTimer = globalThis.setTimeout(() => {
      setPhase('done');
    }, 420);

    return () => {
      globalThis.clearTimeout(finishTimer);
    };
  }, [activated, phase, reducedMotion]);

  return (
    <div
      ref={rootRef}
      className={cn('artist-profile-capture-shell', className)}
    >
      <style>{`
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
      `}</style>

      <div className='mx-auto flex max-w-[32rem] justify-center'>
        <CaptureActionPill capture={capture} phase={phase} />
      </div>

      <div className='mt-14 space-y-3'>
        {capture.audienceRails.map((rail, railIndex) => (
          <AudienceRail
            key={rail.map(({ id }) => id).join('|')}
            direction={railIndex % 2 === 0 ? 'left' : 'right'}
            pills={rail}
            railIndex={railIndex}
          />
        ))}
      </div>
    </div>
  );
}

export function ArtistProfileReactivationVisual({
  notification,
  reactivation,
  className,
}: Readonly<{
  notification: ArtistProfileLandingCopy['capture']['notification'];
  reactivation: ArtistProfileLandingCopy['reactivation'];
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start',
        className
      )}
    >
      <div className='rounded-[1.5rem] bg-white/[0.02] p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.22)]'>
        <div className='rounded-[1.25rem] bg-[#07090d] px-4 py-4'>
          <div className='flex items-start gap-3'>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black'>
              <BellRing className='h-4 w-4' strokeWidth={1.9} />
            </span>
            <div className='min-w-0'>
              <div className='flex items-center gap-2 text-[11px] text-white/60'>
                <p className='font-medium tracking-[-0.01em]'>
                  {notification.appName}
                </p>
                <span>{notification.timeLabel}</span>
              </div>
              <p className='mt-2 text-[15px] font-semibold tracking-[-0.03em] text-primary-token'>
                {notification.title}
              </p>
              <p className='mt-1.5 text-[13px] leading-[1.5] text-white/56'>
                {notification.detail}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className='space-y-3'>
        {reactivation.workflow.rows.map(row => (
          <article
            key={row.id}
            className='rounded-[1.35rem] bg-white/[0.024] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          >
            <div className='flex flex-wrap items-center gap-2.5'>
              <WorkflowBeat value={row.trigger} />
              <WorkflowArrow />
              <WorkflowBeat
                label={reactivation.workflow.columns[1]}
                tone='audience'
                value={row.audience}
              />
              <WorkflowArrow />
              <WorkflowBeat
                label={reactivation.workflow.columns[2]}
                tone='message'
                value={row.message}
              />
              <WorkflowArrow />
              <WorkflowBeat
                label={reactivation.workflow.columns[3]}
                tone='destination'
                value={row.destination}
              />
            </div>
          </article>
        ))}

        <div className='grid gap-3 pt-2 sm:grid-cols-3'>
          {reactivation.outputs.map(output => {
            const Icon = OUTPUT_ICONS[output.id];
            const accent = OUTPUT_ACCENTS[output.id];

            return (
              <article
                key={output.id}
                className='rounded-[1.25rem] bg-white/[0.028] p-4'
              >
                <div className='flex items-center justify-between gap-3'>
                  <Icon
                    className='h-4 w-4'
                    style={{ color: accent }}
                    strokeWidth={1.85}
                  />
                </div>
                <p className='mt-3 text-[0.98rem] font-semibold leading-[1.35] tracking-[-0.03em] text-primary-token'>
                  {output.title}
                </p>
                <div className='mt-4 space-y-1.5'>
                  <p className='text-[13px] leading-[1.5] text-secondary-token'>
                    {output.detail}
                  </p>
                  <p className='text-[12px] font-medium tracking-[-0.01em] text-tertiary-token'>
                    {output.destination}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CaptureActionPill({
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
      className='w-full max-w-[25rem] rounded-full border border-white/10 bg-white/[0.035] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl'
      aria-live='polite'
    >
      <div
        className={cn(
          'flex min-h-[3.7rem] items-center rounded-full px-2 py-1.5 transition-[background-color,transform,opacity] duration-300',
          isDone ? 'justify-center bg-white text-black' : 'gap-2 bg-black/28'
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

            <span className='flex min-w-0 flex-1 items-center rounded-full bg-black/28 px-3 py-3'>
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
                <span className='text-[12px] font-medium tracking-[-0.02em] text-white/64'>
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

function getAudienceRailAccentIndex(
  railIndex: number,
  pillIndex: number
): number {
  const sequence =
    AUDIENCE_RAIL_ACCENT_SEQUENCES[
      railIndex % AUDIENCE_RAIL_ACCENT_SEQUENCES.length
    ] ?? AUDIENCE_RAIL_ACCENT_SEQUENCES[0];

  return sequence[pillIndex % sequence.length] ?? 0;
}

function WorkflowCell({
  label,
  tone,
  value,
}: Readonly<{
  label: string;
  tone?: WorkflowTone;
  value: string;
}>) {
  return (
    <div
      className={
        tone === 'destination'
          ? 'rounded-full border border-white/12 bg-white/[0.07] px-3.5 py-2 text-primary-token'
          : tone === 'message'
            ? 'rounded-full border border-white/8 bg-white/[0.045] px-3.5 py-2 text-white/88'
            : tone === 'audience'
              ? 'rounded-full border border-white/8 bg-white/[0.028] px-3.5 py-2 text-secondary-token'
              : 'rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-primary-token'
      }
    >
      <p className='sr-only'>{label}</p>
      <p
        className={
          tone === 'destination'
            ? 'text-[15px] font-semibold tracking-[-0.03em] text-primary-token'
            : tone === 'audience'
              ? 'text-[14px] font-medium tracking-[-0.02em] text-secondary-token'
              : tone === 'message'
                ? 'text-[14px] font-medium tracking-[-0.02em] text-white/88'
                : 'text-[15px] font-semibold tracking-[-0.03em] text-primary-token'
        }
      >
        {value}
      </p>
    </div>
  );
}

function WorkflowBeat({
  label = 'Trigger',
  tone,
  value,
}: Readonly<{
  label?: string;
  tone?: WorkflowTone;
  value: string;
}>) {
  return <WorkflowCell label={label} tone={tone} value={value} />;
}

function WorkflowArrow() {
  return (
    <span
      aria-hidden='true'
      className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white/35'
    >
      <ArrowRight className='h-3.5 w-3.5' strokeWidth={1.85} />
    </span>
  );
}
