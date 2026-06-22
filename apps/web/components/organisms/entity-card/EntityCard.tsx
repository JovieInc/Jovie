'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { cn } from '@/lib/utils';
import { accentVar, KIND_PRESETS, statusDotVar } from './kind-presets';
import type { EntityCardModel, EntitySurface, EntityTreatment } from './types';

interface EntityCardProps {
  readonly model: EntityCardModel;
  /** Feature Hero / Compact / Detailed — auto-selected by the carousel. */
  readonly treatment?: EntityTreatment;
  /** App shell surface, or the frosted public-profile pearl. */
  readonly surface?: EntitySurface;
  readonly className?: string;
  readonly priority?: boolean;
  readonly dataTestId?: string;
  readonly onClick?: () => void;
}

type SizeConfig = {
  readonly artClass: string;
  readonly titleClass: string;
  readonly showStatus: boolean;
  readonly showMeta: boolean;
  readonly ctaBlock: boolean;
};

// ponytail: one vertical card, three sizes + progressive disclosure — not three
// divergent layouts. "Adapt to real estate" = scale + reveal, single design.
const SIZE: Record<EntityTreatment, SizeConfig> = {
  compact: {
    artClass: 'aspect-square rounded-xl',
    titleClass: 'text-sm',
    showStatus: false,
    showMeta: true,
    ctaBlock: false,
  },
  detailed: {
    artClass: 'aspect-square rounded-xl',
    titleClass: 'text-mid',
    showStatus: true,
    showMeta: true,
    ctaBlock: false,
  },
  big: {
    artClass: 'aspect-[4/5] rounded-2xl',
    titleClass: 'text-xl',
    showStatus: true,
    showMeta: true,
    ctaBlock: true,
  },
};

function CardShell({
  href,
  external,
  testId,
  className,
  style,
  onClick,
  children,
}: Readonly<{
  href?: string | null;
  external?: boolean;
  testId?: string;
  className: string;
  style?: CSSProperties;
  onClick?: () => void;
  children: ReactNode;
}>) {
  if (href?.startsWith('/')) {
    return (
      <Link
        href={href}
        prefetch={false}
        className={className}
        style={style}
        data-testid={testId}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={className}
        style={style}
        data-testid={testId}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return (
    <div className={className} style={style} data-testid={testId}>
      {children}
    </div>
  );
}

export function EntityCard({
  model,
  treatment = 'compact',
  surface = 'app',
  className,
  priority = false,
  dataTestId,
  onClick,
}: EntityCardProps) {
  const size = SIZE[treatment];
  const preset = KIND_PRESETS[model.kind];
  const accent = model.accent ?? preset.accent;
  const Icon = preset.icon;
  const isPearl = surface === 'pearl';

  const cardHref = model.href ?? model.cta?.href ?? null;
  const cardExternal = model.cta?.external;

  const artStyle: CSSProperties = {
    background: `radial-gradient(120% 120% at 32% 22%, color-mix(in oklab, ${accentVar(accent)} 22%, transparent), transparent 62%), linear-gradient(155deg, var(--color-bg-surface-2), var(--color-bg-surface-1))`,
  };

  return (
    <CardShell
      href={cardHref}
      external={cardExternal}
      testId={dataTestId ?? `entity-card-${model.kind}`}
      onClick={onClick}
      className={cn(
        'group flex min-w-0 flex-col text-left transition-[background-color,border-color] duration-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]',
        treatment === 'big' ? 'gap-0 overflow-hidden p-0' : 'gap-3 p-3',
        isPearl
          ? 'rounded-(--profile-inner-radius) border border-(--profile-pearl-border) bg-(--profile-pearl-bg) shadow-(--profile-pearl-shadow) backdrop-blur-2xl hover:bg-(--profile-pearl-bg-hover)'
          : 'rounded-2xl border border-subtle bg-surface-1 shadow-card hover:border-default',
        className
      )}
    >
      <div
        className={cn(
          'relative flex w-full shrink-0 items-center justify-center overflow-hidden border border-subtle',
          size.artClass,
          treatment === 'big' && 'rounded-none border-0'
        )}
        style={artStyle}
      >
        {model.imageUrl ? (
          <ImageWithFallback
            src={model.imageUrl}
            alt={model.imageAlt}
            fill
            priority={priority}
            sizes={treatment === 'big' ? '320px' : '180px'}
            className='object-cover'
            fallbackVariant={preset.fallbackVariant}
            fallbackClassName='bg-transparent'
          />
        ) : model.datePill ? (
          <div className='flex flex-col items-center justify-center text-primary-token'>
            <span className='text-2xs font-semibold uppercase tracking-[0.12em] text-tertiary-token'>
              {model.datePill.month}
            </span>
            <span className='text-[34px] font-bold leading-none tracking-tighter tabular-nums'>
              {model.datePill.day}
            </span>
          </div>
        ) : (
          <Icon className='h-7 w-7 text-tertiary-token' aria-hidden='true' />
        )}
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-1.5',
          treatment === 'big' && 'p-3'
        )}
      >
        <div className='flex min-w-0 items-center justify-between gap-2'>
          <span className='inline-flex min-w-0 items-center gap-1.5 text-3xs font-semibold uppercase leading-none tracking-[0.08em] text-tertiary-token'>
            <Icon className='h-3 w-3 shrink-0' aria-hidden='true' />
            <span className='truncate'>{model.eyebrow ?? preset.eyebrow}</span>
          </span>
          {size.showStatus && model.status ? (
            <span className='inline-flex shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-3xs font-medium uppercase tracking-[0.06em] text-secondary-token'>
              <span
                className='h-1.5 w-1.5 shrink-0 rounded-full'
                style={{ background: statusDotVar(model.status.tone) }}
                aria-hidden='true'
              />
              {model.status.label}
            </span>
          ) : null}
        </div>

        <h3
          className={cn(
            'min-w-0 font-semibold leading-tight tracking-tighter text-primary-token line-clamp-2',
            size.titleClass
          )}
        >
          {model.title}
        </h3>

        {size.showMeta && model.meta ? (
          <p className='min-w-0 truncate text-[11.5px] text-tertiary-token'>
            {model.meta}
          </p>
        ) : null}

        <div
          className={cn(
            'mt-auto flex items-center gap-2 pt-1',
            size.ctaBlock ? 'flex-col items-stretch' : 'justify-between'
          )}
        >
          {model.price ? (
            <div className='min-w-0'>
              <span className='text-sm font-bold text-primary-token'>
                {model.price.original ? (
                  <>
                    {model.price.display}
                    <span className='ml-1 text-2xs font-medium text-tertiary-token line-through'>
                      {model.price.original}
                    </span>
                  </>
                ) : (
                  model.price.display
                )}
              </span>
              {model.price.profit ? (
                <p className='text-2xs text-tertiary-token'>
                  Profit {model.price.profit}
                </p>
              ) : null}
            </div>
          ) : (
            <span aria-hidden='true' />
          )}

          {model.cta ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full border border-(--linear-btn-primary-border) bg-btn-primary px-4 text-xs font-[560] text-btn-primary-foreground transition-colors duration-subtle group-hover:border-(--linear-btn-primary-hover) group-hover:bg-btn-primary-hover',
                size.ctaBlock ? 'h-11 w-full' : 'h-8'
              )}
            >
              {model.cta.label}
            </span>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}
