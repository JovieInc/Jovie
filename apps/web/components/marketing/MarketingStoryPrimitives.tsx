'use client';

import {
  ArrowRight,
  AtSign,
  BellRing,
  Headphones,
  Mail,
  MailCheck,
  Sparkles,
  Ticket,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ArtistNotificationsLandingCopy } from '@/data/artistNotificationsCopy';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import type { CapturePhase } from './artist-profile/captureShared';
import {
  AudienceRail,
  CAPTURE_ANIMATION_STYLES,
  CaptureActionPill,
} from './artist-profile/captureShared';

const NOTIFICATION_CARD_ICONS = {
  capture: AtSign,
  subscribe: Mail,
  email: MailCheck,
  click: Headphones,
  outcome: Ticket,
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
    reducedMotion ? 'done' : 'typing'
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
        observer.disconnect();
      },
      {
        threshold: 0.15,
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

  useEffect(() => {
    if (!activated || reducedMotion || phase !== 'done') {
      return;
    }

    const loopTimer = globalThis.setTimeout(() => {
      setPhase('typing');
    }, 2600);

    return () => {
      globalThis.clearTimeout(loopTimer);
    };
  }, [activated, phase, reducedMotion]);

  return (
    <div
      ref={rootRef}
      className={cn('artist-profile-capture-shell', className)}
    >
      <style>{CAPTURE_ANIMATION_STYLES}</style>

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
    <div className={cn('mx-auto max-w-[27rem]', className)}>
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
    </div>
  );
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
  let wrapperClass: string;
  if (tone === 'destination') {
    wrapperClass =
      'rounded-full border border-white/12 bg-white/[0.07] px-3.5 py-2 text-primary-token';
  } else if (tone === 'message') {
    wrapperClass =
      'rounded-full border border-white/8 bg-white/[0.045] px-3.5 py-2 text-white/88';
  } else if (tone === 'audience') {
    wrapperClass =
      'rounded-full border border-white/8 bg-white/[0.028] px-3.5 py-2 text-secondary-token';
  } else {
    wrapperClass =
      'rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-primary-token';
  }

  let textClass: string;
  if (tone === 'audience') {
    textClass =
      'text-[14px] font-medium tracking-[-0.02em] text-secondary-token';
  } else if (tone === 'message') {
    textClass = 'text-[14px] font-medium tracking-[-0.02em] text-white/88';
  } else {
    textClass =
      'text-[15px] font-semibold tracking-[-0.03em] text-primary-token';
  }

  return (
    <div className={wrapperClass}>
      <p className='sr-only'>{label}</p>
      <p className={textClass}>{value}</p>
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
