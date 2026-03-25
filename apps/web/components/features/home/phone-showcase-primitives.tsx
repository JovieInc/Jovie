/**
 * Shared primitives for phone showcase sections (hero, sticky tour).
 *
 * Extracted to avoid duplication between HeroCinematic (static phone)
 * and StickyPhoneTour (scroll-driven phone with mode transitions).
 */

import { Bell, Calendar, DollarSign, Mail } from 'lucide-react';
import { Children, isValidElement } from 'react';
import { ArtistName } from '@/components/atoms/ArtistName';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { Avatar } from '@/components/molecules/Avatar';
import { PhoneFrame } from './PhoneFrame';
import {
  MOCK_ARTIST,
  MODE_CONTENT,
  type MODE_IDS,
  PHONE_CONTENT_HEIGHT,
} from './phone-mode-content';

/* ------------------------------------------------------------------ */
/*  Mode data                                                          */
/* ------------------------------------------------------------------ */

export interface ModeData {
  id: (typeof MODE_IDS)[number];
  headline: string;
  description: string;
  outcome: string;
}

export const MODES: ModeData[] = [
  {
    id: 'profile',
    headline: 'Keep the fan before they disappear.',
    description:
      'First-time visitors can subscribe fast. Returning fans see the next best action instead of a generic stack of links.',
    outcome: 'Grow',
  },
  {
    id: 'tour',
    headline: 'Show the closest show first.',
    description:
      'A fan in Los Angeles should not scroll through 30 cities. Jovie surfaces the nearest date and ticket button first.',
    outcome: 'Sell tickets',
  },
  {
    id: 'tip',
    headline: 'Turn in-person moments into revenue.',
    description:
      'When someone scans your QR code after a set, Jovie opens the fastest tip flow instead of another menu of links.',
    outcome: 'Earn tips',
  },
  {
    id: 'listen',
    headline: 'Open the right streaming app instantly.',
    description:
      'A new listener taps once. Jovie routes them to Spotify, Apple Music, or YouTube Music without the usual friction.',
    outcome: 'Boost streams',
  },
] as const;

/** Icons shown in the phone's social/action bar, matching the real profile. */
const SOCIAL_BAR_ICONS = [
  {
    key: 'mail',
    activeMode: null,
    render: () => <Mail className='h-3.5 w-3.5' />,
  },
  {
    key: 'instagram',
    activeMode: null,
    render: () => <SocialIcon platform='instagram' size={14} aria-hidden />,
  },
  {
    key: 'spotify',
    activeMode: null,
    render: () => <SocialIcon platform='spotify' size={14} aria-hidden />,
  },
  {
    key: 'tour',
    activeMode: 'tour' as const,
    render: () => <Calendar className='h-3.5 w-3.5' />,
  },
  {
    key: 'tip',
    activeMode: 'tip' as const,
    render: () => <DollarSign className='h-3.5 w-3.5' />,
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Scroll-to-index pure function (testable)                           */
/* ------------------------------------------------------------------ */

export function scrollToActiveIndex(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number,
  modeCount: number
): number {
  const scrollableHeight = sectionHeight - viewportHeight;
  if (scrollableHeight <= 0) return 0;
  const scrolled = -sectionTop;
  const progress = Math.max(0, Math.min(1, scrolled / scrollableHeight));
  return Math.min(modeCount - 1, Math.floor(progress * modeCount));
}

/* ------------------------------------------------------------------ */
/*  CrossfadeBlock                                                     */
/* ------------------------------------------------------------------ */

export function CrossfadeBlock({
  activeIndex,
  children,
}: {
  readonly activeIndex: number;
  readonly children: React.ReactNode;
}) {
  const childNodes = Children.toArray(children);
  return (
    <div className='grid'>
      {childNodes.map((child, index) => {
        const childKey =
          isValidElement(child) && child.key !== null
            ? String(child.key)
            : `crossfade-${index}`;
        return (
          <div
            key={childKey}
            aria-hidden={index !== activeIndex}
            className='transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
            style={{
              opacity: index === activeIndex ? 1 : 0,
              gridArea: '1 / 1',
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PhoneShowcase — artist header + dot indicators + mode content       */
/* ------------------------------------------------------------------ */

interface PhoneShowcaseProps {
  readonly activeIndex: number;
  readonly modes: readonly ModeData[];
}

export function PhoneShowcase({ activeIndex, modes }: PhoneShowcaseProps) {
  return (
    <PhoneFrame>
      <div className='flex items-center justify-between px-4 pt-10 pb-1'>
        <CircleIconButton size='xs' variant='surface' ariaLabel='Jovie'>
          <BrandLogo size={14} tone='auto' rounded={false} aria-hidden />
        </CircleIconButton>
        <CircleIconButton size='xs' variant='ghost' ariaLabel='Notifications'>
          <Bell className='h-4 w-4' />
        </CircleIconButton>
      </div>

      <div className='flex flex-col items-center px-5 pb-2'>
        <div className='rounded-full p-[2px] ring-1 ring-white/6 shadow-sm'>
          <Avatar
            src={MOCK_ARTIST.image}
            alt={MOCK_ARTIST.name}
            name={MOCK_ARTIST.name}
            size='display-md'
            verified={MOCK_ARTIST.isVerified}
          />
        </div>
        <div className='mt-2.5 text-center'>
          <ArtistName
            name={MOCK_ARTIST.name}
            handle={MOCK_ARTIST.handle}
            isVerified={MOCK_ARTIST.isVerified}
            size='md'
            showLink={false}
            as='p'
          />
          <p className='mt-0.5 text-xs text-tertiary-token tracking-[0.2em] uppercase'>
            Artist
          </p>
        </div>
      </div>

      <div
        className='flex items-center justify-center gap-1.5 py-2.5'
        aria-hidden='true'
      >
        {SOCIAL_BAR_ICONS.map(icon => {
          const isActive =
            icon.activeMode !== null &&
            modes[activeIndex]?.id === icon.activeMode;
          return (
            <span
              key={icon.key}
              aria-hidden='true'
              className='inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-300'
              style={{
                borderColor: isActive
                  ? 'var(--linear-border-default)'
                  : 'rgba(255,255,255,0.06)',
                backgroundColor: isActive
                  ? 'var(--linear-bg-surface-1)'
                  : 'transparent',
                color: isActive
                  ? 'var(--linear-text-primary)'
                  : 'var(--linear-text-tertiary)',
              }}
            >
              {icon.render()}
            </span>
          );
        })}
      </div>

      <div
        className='relative overflow-hidden'
        style={{ height: PHONE_CONTENT_HEIGHT }}
      >
        {modes.map((mode, i) => (
          <div
            key={mode.id}
            className='absolute inset-0 px-5 transition-opacity duration-500 ease-[cubic-bezier(0.33,.01,.27,1)]'
            style={{
              opacity: i === activeIndex ? 1 : 0,
              pointerEvents: i === activeIndex ? 'auto' : 'none',
            }}
          >
            {MODE_CONTENT[mode.id]}
          </div>
        ))}
      </div>

      <div className='pb-3 pt-1 text-center'>
        <p className='text-[9px] uppercase tracking-[0.15em] text-quaternary-token'>
          Powered by Jovie
        </p>
      </div>
    </PhoneFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  MobileCard                                                         */
/* ------------------------------------------------------------------ */

export function MobileCard({ mode }: { readonly mode: ModeData }) {
  return (
    <div
      className='rounded-xl px-6 py-6'
      style={{
        backgroundColor: 'var(--linear-bg-hover)',
        border: '1px solid var(--linear-border-subtle)',
      }}
    >
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-lg font-semibold tracking-tight text-primary-token'>
          {mode.headline}
        </h3>
        <span className='shrink-0 rounded-full border border-subtle px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-secondary-token'>
          {mode.outcome}
        </span>
      </div>
      <p className='mt-2 text-[14px] leading-[1.6] text-secondary-token'>
        {mode.description}
      </p>
    </div>
  );
}
