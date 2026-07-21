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
  ArtistProfileCaptureVisualCopy,
} from '@/data/artistProfileCopy';
import { ACCENT_ROTATION, getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import './captureShared.css';

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

/**
 * @deprecated The animation/effect styles now live in `./captureShared.css`,
 * which this module imports for side effects. Kept as an empty string so the
 * existing `<style>` injection in MarketingStoryPrimitives keeps typechecking
 * until that consumer migrates.
 */
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
      className='ap-capture-action w-full max-w-108 rounded-full p-1.5 backdrop-blur-xl'
      aria-live='polite'
    >
      <div
        className={cn(
          'flex min-h-16 items-center rounded-full px-2 py-1.5 transition-[background-color,transform,opacity] duration-subtle',
          isDone
            ? 'justify-center bg-surface-1 text-primary-token'
            : 'ap-capture-action__inner--idle gap-2'
        )}
      >
        {isDone ? (
          <div className='flex items-center justify-center gap-2.5 px-3'>
            <span className='inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-0 text-primary-token'>
              <Check className='h-3.5 w-3.5' strokeWidth={2.4} />
            </span>
            <span className='ap-capture-tracking rounded-full bg-surface-1 px-1 text-xs font-semibold text-primary-token'>
              {capture.action.confirmedLabel}
            </span>
          </div>
        ) : (
          <>
            <span className='ap-capture-action__icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary-token'>
              <Mail className='h-4 w-4' strokeWidth={1.9} />
            </span>

            <span className='ap-capture-action__field flex min-w-0 flex-1 items-center rounded-full px-3.5 py-3'>
              {isTyping || isSubmitting ? (
                <>
                  <span className='artist-profile-capture-typed ap-capture-tracking inline-block overflow-hidden whitespace-nowrap font-mono text-xs font-medium text-primary-token'>
                    {DEMO_SUBSCRIBE_EMAIL}
                  </span>
                  {isTyping ? (
                    <span className='artist-profile-capture-caret ap-capture-action__caret ml-0.5 inline-block h-3.5 w-px' />
                  ) : null}
                </>
              ) : (
                <span className='ap-capture-tracking text-xs font-medium text-tertiary-token'>
                  {capture.action.detail}
                </span>
              )}
            </span>

            <span
              className={cn(
                'ap-capture-tracking rounded-full px-4 py-2.5 text-xs font-semibold transition-[background-color,color,transform] duration-subtle',
                isSubmitting
                  ? 'ap-capture-action__cta--submitting scale-[0.96] text-primary-token'
                  : 'bg-surface-1 text-primary-token'
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

  return (
    <li
      className='artist-profile-audience-pill group'
      data-accent={accentIndex % PILL_ACCENTS.length}
    >
      <span className='relative z-10 flex items-center gap-2.5 px-4 py-3'>
        <Icon
          className='artist-profile-audience-pill__icon h-4 w-4 shrink-0'
          strokeWidth={1.9}
        />
        <span className='artist-profile-audience-pill__text text-primary-token'>
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
      <div
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
