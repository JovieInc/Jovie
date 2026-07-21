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
import type {
  ArtistProfileAudiencePill,
  ArtistProfileCaptureVisualCopy,
} from '@/data/artistProfileCopy';
import { ACCENT_ROTATION } from '@/lib/ui/accent-palette';
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

const ACCENT_ICON_CLASS = [
  'text-secondary-token',
  'text-accent-blue',
  'text-accent-purple',
  'text-accent-pink',
  'text-accent-red',
  'text-accent-orange',
  'text-accent-green',
  'text-accent-teal',
] as const;

export const PILL_ACCENTS = ACCENT_ROTATION;

export const AUDIENCE_RAIL_ACCENT_SEQUENCES = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [3, 6, 1, 4, 7, 2, 5, 0],
  [5, 0, 4, 1, 6, 3, 7, 2],
] as const;

export const DEMO_SUBSCRIBE_EMAIL = 'ava@icloud.com';

export type CapturePhase = 'idle' | 'typing' | 'submitting' | 'done';

/** Styles live in design-system.css as system-b-artist-profile-* classes. */
export const CAPTURE_ANIMATION_STYLES = '';

export function CaptureActionPill({
  capture,
  phase,
}: Readonly<{
  capture: ArtistProfileCaptureVisualCopy;
  phase: CapturePhase;
}>) {
  const isTyping = phase === 'typing';
  const isSubmitting = phase === 'submitting';
  const isDone = phase === 'done';

  return (
    <div
      className='w-full max-w-md rounded-full border border-subtle bg-surface-1 p-1.5'
      aria-live='polite'
    >
      <div
        className={cn(
          'flex min-h-16 items-center rounded-full px-2 py-1.5 transition-[background-color,transform,opacity] duration-subtle',
          isDone
            ? 'justify-center bg-surface-1 text-primary-token'
            : 'gap-2 bg-surface-0'
        )}
      >
        {isDone ? (
          <div className='flex items-center justify-center gap-2.5 px-3'>
            <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-token text-surface-1'>
              <Check className='h-3.5 w-3.5' strokeWidth={2.4} />
            </span>
            <span className='rounded-full bg-surface-1 px-1 text-xs font-semibold tracking-tight text-primary-token'>
              {capture.action.confirmedLabel}
            </span>
          </div>
        ) : (
          <>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-1 text-primary-token'>
              <Mail className='h-4 w-4' strokeWidth={1.9} />
            </span>

            <span className='flex min-w-0 flex-1 items-center rounded-full border border-subtle bg-surface-0 px-3.5 py-3'>
              {isTyping || isSubmitting ? (
                <>
                  <span className='system-b-artist-profile-capture-typed inline-block overflow-hidden whitespace-nowrap font-mono text-xs font-medium tracking-tight text-primary-token'>
                    {DEMO_SUBSCRIBE_EMAIL}
                  </span>
                  {isTyping ? (
                    <span className='system-b-artist-profile-capture-caret ml-0.5 inline-block h-3.5 w-px bg-secondary-token' />
                  ) : null}
                </>
              ) : (
                <span className='text-xs font-medium tracking-tight text-quaternary-token'>
                  {capture.action.detail}
                </span>
              )}
            </span>

            <span
              className={cn(
                'rounded-full px-4 py-2.5 text-xs font-semibold tracking-tight transition-[background-color,color,transform] duration-subtle',
                isSubmitting
                  ? 'scale-press bg-surface-1 text-primary-token'
                  : 'bg-primary-token text-surface-1'
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
  const accentClass =
    ACCENT_ICON_CLASS[accentIndex % ACCENT_ICON_CLASS.length] ??
    ACCENT_ICON_CLASS[0];

  return (
    <li className='system-b-artist-profile-capture-pill group'>
      <span className='relative z-10 flex items-center gap-2.5 px-4 py-3'>
        <Icon
          className={cn('h-4 w-4 shrink-0', accentClass)}
          strokeWidth={1.9}
        />
        <span className='leading-snug text-primary-token'>{pill.sentence}</span>
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
      className='system-b-artist-profile-audience-mask overflow-hidden py-1'
      aria-hidden='true'
    >
      <div
        className={cn(
          'system-b-artist-profile-audience-rail',
          direction === 'right' &&
            'system-b-artist-profile-audience-rail-reverse'
        )}
      >
        {repeatedPills.map(({ pill, repeat }, index) => (
          <AudiencePill
            key={`${repeat}-${pill.id}`}
            accentIndex={getAudienceRailAccentIndex(railIndex, index)}
            pill={pill}
          />
        ))}
      </div>
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
