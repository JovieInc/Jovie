'use client';

import {
  Bell,
  CalendarPlus,
  ChevronRight,
  type LucideIcon,
  MapPin,
  Play,
  ShoppingBag,
  Ticket,
} from 'lucide-react';
import Link from 'next/link';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { cn } from '@/lib/utils';

type ProfileMediaCardAccent = 'blue' | 'orange' | 'pink' | 'purple' | 'green';
type ProfileMediaCardRatio = 'square' | 'portrait' | 'landscape' | 'compact';
type ProfileMediaCardFallback = 'release' | 'avatar' | 'generic';
type ProfileMediaCardIcon =
  | 'Bell'
  | 'CalendarPlus'
  | 'Play'
  | 'ShoppingBag'
  | 'Ticket';

export type ProfileMediaCardCountdown = {
  readonly targetDate: Date | string;
  readonly label?: string;
  readonly now?: Date;
};

export type ProfileMediaCardDatePill = {
  readonly month: string;
  readonly day: string;
  readonly meta?: string;
};

export type ProfileMediaCardStatus = {
  readonly label: '24 hours left' | 'Almost gone' | string;
  readonly tone?: ProfileMediaCardAccent;
};

export type ProfileMediaCardAction = {
  readonly label: string;
  readonly ariaLabel?: string;
  readonly href?: string | null;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  readonly icon?: ProfileMediaCardIcon;
  readonly disabled?: boolean;
  readonly showChevron?: boolean;
  readonly external?: boolean;
};

export interface ProfileMediaCardProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string | null;
  readonly locationLabel?: string | null;
  readonly secondaryLocationLabel?: string | null;
  readonly imageUrl?: string | null;
  readonly imageAlt: string;
  readonly fallbackVariant?: ProfileMediaCardFallback;
  readonly accent?: ProfileMediaCardAccent;
  readonly ratio?: ProfileMediaCardRatio;
  readonly countdown?: ProfileMediaCardCountdown | null;
  readonly datePill?: ProfileMediaCardDatePill | null;
  readonly status?: ProfileMediaCardStatus | null;
  readonly action?: ProfileMediaCardAction | null;
  readonly secondaryAction?: ProfileMediaCardAction | null;
  readonly priority?: boolean;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly dataTestId?: string;
}

const ACCENT_CLASS_NAMES: Record<ProfileMediaCardAccent, string> = {
  blue: 'text-sky-300',
  orange: 'text-orange-300',
  pink: 'text-pink-300',
  purple: 'text-violet-300',
  green: 'text-emerald-300',
};

const ACTION_ICONS: Record<ProfileMediaCardIcon, LucideIcon> = {
  Bell,
  CalendarPlus,
  Play,
  ShoppingBag,
  Ticket,
};

const RATIO_CLASS_NAMES: Record<ProfileMediaCardRatio, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  landscape: 'aspect-[5/3]',
  compact: 'aspect-[3/4]',
};

const CONTENT_CLASS_NAMES: Record<ProfileMediaCardRatio, string> = {
  square: 'p-4',
  portrait: 'p-4',
  landscape: 'max-w-[63%] justify-end p-4',
  compact: 'p-2',
};

type CountdownParts = {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly total: number;
};

function getCountdownParts(targetDate: Date, now: Date): CountdownParts {
  const total = targetDate.getTime() - now.getTime();
  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }

  return {
    total,
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
  };
}

function formatTwoDigit(value: number): string {
  return value.toString().padStart(2, '0');
}

function CountdownGrid({
  countdown,
  compact,
}: Readonly<{
  countdown: ProfileMediaCardCountdown;
  compact: boolean;
}>) {
  const targetDate = useMemo(
    () => new Date(countdown.targetDate),
    [countdown.targetDate]
  );
  const [parts, setParts] = useState<CountdownParts | null>(() =>
    countdown.now ? getCountdownParts(targetDate, countdown.now) : null
  );

  useEffect(() => {
    if (countdown.now) {
      setParts(getCountdownParts(targetDate, countdown.now));
      return;
    }

    setParts(getCountdownParts(targetDate, new Date()));
    const timer = window.setInterval(() => {
      setParts(getCountdownParts(targetDate, new Date()));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [countdown.now, targetDate]);

  if (Number.isNaN(targetDate.getTime()) || (parts && parts.total <= 0)) {
    return null;
  }

  const visibleParts = parts ?? {
    total: 1,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  };
  const cells = [
    ['Days', formatTwoDigit(visibleParts.days)],
    ['Hrs', formatTwoDigit(visibleParts.hours)],
    ['Min', formatTwoDigit(visibleParts.minutes)],
    ['Sec', formatTwoDigit(visibleParts.seconds)],
  ] as const;
  const isPendingClientTime = parts === null;

  return (
    <div
      className={cn(
        'space-y-2',
        compact && 'space-y-1',
        isPendingClientTime && 'invisible'
      )}
      aria-hidden={isPendingClientTime || undefined}
    >
      {countdown.label ? (
        <p
          className={cn(
            'font-medium tracking-[-0.01em] text-white/68',
            compact ? 'text-[9px]' : 'text-[12px]'
          )}
        >
          {countdown.label}
        </p>
      ) : null}
      <div className={cn('grid grid-cols-4', compact ? 'gap-1.5' : 'gap-3.5')}>
        {cells.map(([label, value]) => (
          <div key={label} className='min-w-0'>
            <p
              className={cn(
                'font-[680] leading-none tracking-[-0.018em] text-white tabular-nums',
                compact ? 'text-[11px]' : 'text-[30px]'
              )}
            >
              {value}
            </p>
            <p
              className={cn(
                'mt-1 font-semibold uppercase tracking-[0.12em] text-white/52',
                compact ? 'text-[6.5px]' : 'text-[10px]'
              )}
            >
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DatePill({
  datePill,
  compact,
}: Readonly<{
  datePill: ProfileMediaCardDatePill;
  compact: boolean;
}>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center justify-center border border-white/14 bg-white/10 text-white shadow-[0_12px_26px_rgba(0,0,0,0.2)] backdrop-blur-xl',
        compact
          ? 'min-w-8 rounded-[9px] px-1.5 py-1'
          : 'min-w-[62px] rounded-[15px] px-3 py-2.5'
      )}
    >
      <span
        className={cn(
          'font-semibold uppercase tracking-[0.12em]',
          compact ? 'text-[7px]' : 'text-[10px]'
        )}
      >
        {datePill.month}
      </span>
      <span
        className={cn(
          'font-[680] leading-none tracking-[-0.02em] tabular-nums',
          compact ? 'mt-0.5 text-[12px]' : 'mt-1 text-[22px]'
        )}
      >
        {datePill.day}
      </span>
      {datePill.meta && !compact ? (
        <span className='mt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-white/72'>
          {datePill.meta}
        </span>
      ) : null}
    </div>
  );
}

function CardAction({
  action,
  compact,
}: Readonly<{
  action: ProfileMediaCardAction;
  compact: boolean;
}>) {
  const Icon = action.icon ? ACTION_ICONS[action.icon] : null;
  const content = (
    <>
      <span
        className={cn(
          'inline-flex min-w-0 items-center gap-2',
          !action.showChevron && 'justify-center'
        )}
      >
        {Icon ? (
          <Icon
            className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-4 w-4')}
            fill={action.icon === 'Play' ? 'currentColor' : 'none'}
          />
        ) : null}
        <span className='truncate'>{action.label}</span>
      </span>
      {action.showChevron ? (
        <ChevronRight
          className={cn(
            'shrink-0 text-black/62',
            compact ? 'h-3 w-3' : 'h-4 w-4'
          )}
        />
      ) : null}
    </>
  );
  const className = cn(
    'inline-flex w-full items-center rounded-full bg-white text-black shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition-opacity duration-200 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black',
    action.showChevron ? 'justify-between' : 'justify-center',
    compact
      ? 'h-7 gap-1 px-2.5 text-[10px] font-[680]'
      : 'h-12 gap-2 px-5 text-[14px] font-[680]',
    action.disabled &&
      'cursor-not-allowed bg-white/14 text-white/42 hover:opacity-100'
  );

  if (action.disabled || (!action.href && !action.onClick)) {
    return (
      <span className={className} aria-disabled={action.disabled || undefined}>
        {content}
      </span>
    );
  }

  if (action.href?.startsWith('/')) {
    return (
      <Link
        href={action.href}
        prefetch={false}
        onClick={action.onClick}
        aria-label={action.ariaLabel}
        className={className}
      >
        {content}
      </Link>
    );
  }

  if (action.href) {
    return (
      <a
        href={action.href}
        target={(action.external ?? true) ? '_blank' : undefined}
        rel={(action.external ?? true) ? 'noopener noreferrer' : undefined}
        onClick={action.onClick}
        aria-label={action.ariaLabel}
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type='button'
      onClick={action.onClick}
      aria-label={action.ariaLabel}
      className={className}
    >
      {content}
    </button>
  );
}

export function ProfileMediaCard({
  eyebrow,
  title,
  subtitle,
  locationLabel,
  secondaryLocationLabel,
  imageUrl,
  imageAlt,
  fallbackVariant = 'release',
  accent = 'purple',
  ratio = 'square',
  countdown,
  datePill,
  status,
  action,
  secondaryAction,
  priority = false,
  className,
  imageClassName,
  dataTestId,
}: Readonly<ProfileMediaCardProps>) {
  const compact = ratio === 'compact';
  const landscape = ratio === 'landscape';
  const accentClassName = ACCENT_CLASS_NAMES[accent];
  const isArtistPhoto = fallbackVariant === 'avatar';

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-[20px] border border-white/8 bg-[#0e0f12] text-left shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)]',
        compact && 'rounded-[12px]',
        className
      )}
      data-testid={dataTestId}
    >
      <div
        className={cn(
          'relative overflow-hidden bg-[#1a1a1e]',
          RATIO_CLASS_NAMES[ratio]
        )}
      >
        <ImageWithFallback
          src={imageUrl}
          alt={imageAlt}
          fill
          priority={priority}
          sizes={
            compact
              ? '112px'
              : landscape
                ? '(max-width: 767px) 100vw, 390px'
                : '(max-width: 767px) 85vw, 320px'
          }
          className={cn(
            'object-cover object-center',
            isArtistPhoto ? 'contrast-[1.02]' : 'grayscale contrast-[1.05]',
            imageClassName
          )}
          fallbackVariant={fallbackVariant}
          fallbackClassName='bg-white/[0.04]'
        />
        <div
          className={cn(
            'absolute inset-0',
            landscape
              ? 'bg-[linear-gradient(90deg,#0a0a0c_0%,rgba(10,10,12,0.94)_28%,rgba(10,10,12,0.42)_58%,rgba(10,10,12,0.06)_100%)]'
              : 'bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.46)_46%,rgba(0,0,0,0.9)_100%)]'
          )}
        />

        {datePill ? (
          <div
            className={cn(
              'absolute z-10',
              compact ? 'right-1.5 top-1.5' : 'right-4 top-4'
            )}
          >
            <DatePill datePill={datePill} compact={compact} />
          </div>
        ) : null}

        <div
          className={cn(
            'absolute inset-0 z-10 flex flex-col',
            'justify-end',
            CONTENT_CLASS_NAMES[ratio]
          )}
        >
          <div className={cn('space-y-1.5', compact && 'space-y-1')}>
            <p
              className={cn(
                'font-[680] uppercase text-white/72',
                accentClassName,
                compact
                  ? 'text-[7.5px] leading-none tracking-[0.14em]'
                  : 'text-[10px] tracking-[0.16em]'
              )}
            >
              {eyebrow}
            </p>
            <h3
              className={cn(
                'font-[680] leading-[1.03] tracking-[-0.026em] text-white',
                compact
                  ? 'line-clamp-2 text-[12px]'
                  : landscape
                    ? 'text-[26px]'
                    : 'line-clamp-2 text-[26px]'
              )}
            >
              {title}
            </h3>
            {subtitle ? (
              <p
                className={cn(
                  'line-clamp-2 text-white/78',
                  compact ? 'text-[9px] leading-[1.25]' : 'text-[13px]'
                )}
              >
                {subtitle}
              </p>
            ) : null}
            {locationLabel ? (
              <p
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 text-white/78',
                  compact ? 'text-[9px]' : 'text-[12px]'
                )}
              >
                <MapPin
                  className={cn(
                    'shrink-0',
                    compact ? 'h-2.5 w-2.5' : 'h-3 w-3'
                  )}
                />
                <span className='truncate'>{locationLabel}</span>
              </p>
            ) : null}
            {secondaryLocationLabel ? (
              <p
                className={cn(
                  'truncate text-white/62',
                  compact ? 'text-[9px]' : 'text-[12px]'
                )}
              >
                {secondaryLocationLabel}
              </p>
            ) : null}
            {status ? (
              <p
                className={cn(
                  'inline-flex items-center gap-2 font-semibold tracking-[-0.005em] text-white',
                  compact ? 'text-[9px]' : 'text-[13px]'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    status.tone === 'green'
                      ? 'bg-emerald-300'
                      : status.tone === 'blue'
                        ? 'bg-sky-300'
                        : status.tone === 'orange'
                          ? 'bg-orange-300'
                          : status.tone === 'purple'
                            ? 'bg-violet-300'
                            : 'bg-pink-300'
                  )}
                  aria-hidden='true'
                />
                <span>{status.label}</span>
              </p>
            ) : null}
            {countdown ? (
              <CountdownGrid countdown={countdown} compact={compact} />
            ) : null}
          </div>
        </div>
      </div>

      {action || secondaryAction ? (
        <div className={cn('bg-black', compact ? 'p-1.5' : 'px-3.5 py-4')}>
          <div
            className={cn(
              'grid gap-2',
              action && secondaryAction && !compact && 'grid-cols-2'
            )}
          >
            {action ? <CardAction action={action} compact={compact} /> : null}
            {secondaryAction ? (
              <CardAction action={secondaryAction} compact={compact} />
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
