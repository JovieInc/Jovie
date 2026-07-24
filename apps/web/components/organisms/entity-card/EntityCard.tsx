'use client';

import Link from 'next/link';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import {
  getProfileCardShapeClassName,
  PROFILE_CARD_FOOTER_ANCHOR_CLASSNAME,
  type ProfileCardShape,
} from '@/lib/profile/composition';
import { cn } from '@/lib/utils';
import { accentVar, KIND_PRESETS, statusDotVar } from './kind-presets';
import type {
  EntityCardCta,
  EntityCardModel,
  EntitySurface,
  EntityTreatment,
} from './types';

interface EntityCardProps {
  readonly model: EntityCardModel;
  /** Feature Hero / Compact / Detailed — auto-selected by the carousel. */
  readonly treatment?: EntityTreatment;
  /** App shell surface, or the frosted public-profile pearl. */
  readonly surface?: EntitySurface;
  /**
   * Deterministic composition shape (#11899). When set, the card renders at
   * a fixed aspect ratio: the media zone is fixed, text truncates inside the
   * shape, and the CTA stays anchored to the bottom edge. When omitted the
   * card keeps its legacy content-driven height (chat/app consumers).
   */
  readonly shape?: ProfileCardShape;
  readonly className?: string;
  readonly priority?: boolean;
  readonly dataTestId?: string;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  /**
   * 'square' (default): the art zone is a fixed square — for content-driven
   * card heights. 'fill': the art zone flexes to fill whatever height the
   * content zone leaves — for height-locked cards where a fixed square would
   * push the CTA out of the card. Ignored when `anatomy='unified'` (the art
   * zone is always a full-width square there).
   */
  readonly artFit?: 'square' | 'fill';
  /**
   * 'unified': the single profile-card anatomy — full-bleed square art zone
   * (object-cover, no letterboxing), eyebrow/title/meta text zone, and a
   * full-width 36px CTA anchored to the bottom. Used by every card in the
   * profile home carousel so the featured card, entity cards, and slot cards
   * share one design. 'default' keeps the legacy per-treatment layout
   * (chat/app consumers).
   */
  readonly anatomy?: 'default' | 'unified';
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
    artClass: 'aspect-card-standard rounded-2xl',
    titleClass: 'text-xl',
    showStatus: true,
    showMeta: true,
    ctaBlock: true,
  },
};

function EntityCtaControl({
  cta,
  block,
  unified = false,
}: Readonly<{
  cta: EntityCardCta;
  block: boolean;
  unified?: boolean;
}>) {
  // Unified anatomy: a CTA with no target is not a button at all — render it
  // as plain muted meta text (e.g. "No Tickets"), never with button chrome.
  if (unified && (cta.disabled || (!cta.href && !cta.onClick))) {
    return (
      <span className='flex h-9 w-full items-center text-xs text-tertiary-token'>
        {cta.label}
      </span>
    );
  }

  const className = cn(
    'inline-flex shrink-0 items-center justify-center rounded-full border border-(--linear-btn-primary-border) bg-btn-primary px-4 text-xs font-[560] text-btn-primary-foreground transition-colors duration-subtle hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover',
    // Unified anatomy: full-width 36px CTA (two CTAs share the row evenly).
    unified
      ? 'h-9 min-w-0 flex-1'
      : block
        ? 'h-11 w-full'
        : 'h-11 min-w-0 flex-1',
    cta.disabled &&
      'cursor-not-allowed border-subtle bg-surface-0 text-tertiary-token hover:border-subtle hover:bg-surface-0'
  );

  if (cta.disabled || (!cta.href && !cta.onClick)) {
    return (
      <span className={className} aria-disabled={cta.disabled || undefined}>
        {cta.label}
      </span>
    );
  }

  if (cta.href?.startsWith('/')) {
    return (
      <Link
        href={cta.href}
        prefetch={false}
        onClick={cta.onClick}
        className={className}
      >
        {cta.label}
      </Link>
    );
  }

  if (cta.href) {
    return (
      <a
        href={cta.href}
        target={cta.external ? '_blank' : undefined}
        rel={cta.external ? 'noopener noreferrer' : undefined}
        onClick={cta.onClick}
        className={className}
      >
        {cta.label}
      </a>
    );
  }

  return (
    <button type='button' onClick={cta.onClick} className={className}>
      {cta?.label || 'Action'}
    </button>
  );
}

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
  onClick?: (event: MouseEvent<HTMLElement>) => void;
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
  shape,
  className,
  priority = false,
  dataTestId,
  onClick,
  artFit = 'square',
  anatomy = 'default',
}: EntityCardProps) {
  const size = SIZE[treatment];
  const isUnified = anatomy === 'unified';
  // Composition shape (#11899): fixed card aspect + semantic media geometry.
  // Album/product/show artwork is square; video thumbnails stay landscape.
  // Text truncates inside the shape; the CTA footer never moves.
  const shapeClassName = shape
    ? cn(getProfileCardShapeClassName(shape), 'overflow-hidden')
    : null;
  const artClassName = isUnified
    ? // Unified anatomy: the art zone is a full-width square (album art is
      // square by default; non-square art object-covers the square zone).
      'aspect-square rounded-none'
    : artFit === 'fill'
      ? 'min-h-0 w-full flex-1 rounded-xl'
      : shape
        ? cn(
            model.kind === 'video' ? 'aspect-video' : 'aspect-square',
            treatment === 'big' ? 'rounded-2xl' : 'rounded-xl'
          )
        : size.artClass;
  const titleClampClassName = isUnified
    ? 'line-clamp-1'
    : shape && treatment !== 'big'
      ? 'line-clamp-1'
      : 'line-clamp-2';
  const preset = KIND_PRESETS[model.kind];
  const accent = model.accent ?? preset.accent;
  const Icon = preset.icon;
  const isPearl = surface === 'pearl';

  const isInteractive =
    model.interactive === true ||
    Boolean(model.cta?.onClick || model.secondaryCta);
  const cardHref = isInteractive
    ? null
    : (model.href ?? model.cta?.href ?? null);
  const cardExternal = model.cta?.external;

  const artStyle: CSSProperties = {
    background: `radial-gradient(120% 120% at 32% 22%, color-mix(in oklab, ${accentVar(accent)} 22%, transparent), transparent 62%), linear-gradient(155deg, var(--color-bg-surface-2), var(--color-bg-surface-1))`,
  };

  // Unified anatomy: one meta line — the price joins it instead of a separate
  // footer block, so every card shares the eyebrow/title/meta/CTA anatomy.
  const metaText =
    isUnified && model.price
      ? [model.meta, model.price.display].filter(Boolean).join(' · ')
      : model.meta;

  return (
    <CardShell
      href={cardHref}
      external={cardExternal}
      testId={dataTestId ?? `entity-card-${model.kind}`}
      onClick={onClick}
      className={cn(
        'group flex min-w-0 flex-col text-left transition-[background-color,border-color] duration-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)',
        treatment === 'big' || isUnified
          ? 'gap-0 overflow-hidden p-0'
          : 'gap-3 p-3',
        isPearl
          ? 'rounded-(--profile-inner-radius) border border-(--profile-pearl-border) bg-(--profile-pearl-bg) shadow-(--profile-pearl-shadow) backdrop-blur-2xl hover:bg-(--profile-pearl-bg-hover)'
          : 'rounded-2xl border border-subtle bg-surface-1 shadow-card hover:border-default',
        shapeClassName,
        className
      )}
    >
      <div
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden border border-subtle',
          !isUnified && artFit === 'fill' ? null : 'shrink-0',
          artClassName,
          (treatment === 'big' || isUnified) && 'rounded-none border-0',
          isUnified && 'border-b border-subtle'
        )}
        style={artStyle}
      >
        {model.imageUrl ? (
          <ImageWithFallback
            src={model.imageUrl}
            alt={model.imageAlt}
            fill
            priority={priority}
            sizes={
              treatment === 'big' ? '320px' : '(max-width: 767px) 70vw, 300px'
            }
            className={
              // Unified anatomy: square art in a square zone — cover crops
              // non-square art instead of letterboxing it.
              isUnified || model.kind !== 'music'
                ? 'object-cover'
                : 'object-contain'
            }
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
          <Icon
            className={cn(
              'text-tertiary-token',
              isUnified ? 'h-8 w-8' : 'h-7 w-7'
            )}
            aria-hidden='true'
          />
        )}
      </div>

      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col gap-1.5',
          treatment === 'big' && 'p-3',
          // Unified: the text zone + 36px CTA share (card height − card
          // width), which is tight on small cards — keep chrome minimal so
          // eyebrow + title + CTA always fit; the meta line hides entirely
          // below the card-height threshold where it would clip (see
          // .entity-card-meta in design-system.css).
          isUnified && 'px-3 py-1.5'
        )}
      >
        {/* Text zone — when the card is height-locked it clips so the CTA
            footer below never moves (#11899: content fits the shape, button
            never shifts). */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            isUnified ? 'gap-1' : 'gap-1.5'
          )}
        >
          <div className='flex min-w-0 items-center justify-between gap-2'>
            <span
              className={cn(
                'inline-flex min-w-0 items-center gap-1.5 text-3xs font-semibold leading-none text-tertiary-token',
                isUnified && 'entity-card-eyebrow'
              )}
            >
              <Icon className='h-3 w-3 shrink-0' aria-hidden='true' />
              <span className='truncate'>
                {model.eyebrow ?? preset.eyebrow}
              </span>
            </span>
            {size.showStatus && !isUnified && model.status ? (
              <span className='inline-flex shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-3xs font-medium text-secondary-token'>
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
              'min-w-0 font-[590] leading-tight tracking-tighter text-primary-token',
              titleClampClassName,
              // Unified: match the featured card's title size — one design.
              isUnified ? 'text-sm' : size.titleClass
            )}
          >
            {model.title}
          </h3>

          {size.showMeta && metaText ? (
            <p
              className={cn(
                'min-w-0 truncate text-[11.5px] text-tertiary-token',
                isUnified && 'entity-card-meta'
              )}
            >
              {metaText}
            </p>
          ) : null}

          {size.showMeta && model.secondaryMeta ? (
            <p
              className={cn(
                'min-w-0 truncate text-[11.5px] text-tertiary-token',
                isUnified && 'entity-card-meta'
              )}
            >
              {model.secondaryMeta}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            'flex gap-2',
            isUnified ? null : 'pt-1',
            PROFILE_CARD_FOOTER_ANCHOR_CLASSNAME,
            isUnified
              ? isInteractive
                ? 'flex-row items-stretch'
                : 'flex-col items-stretch'
              : isInteractive
                ? size.ctaBlock
                  ? 'flex-col items-stretch'
                  : 'flex-row items-stretch'
                : cn(
                    'items-center',
                    size.ctaBlock ? 'flex-col items-stretch' : 'justify-between'
                  )
          )}
        >
          {isInteractive ? (
            <>
              {model.cta ? (
                <EntityCtaControl
                  cta={model.cta}
                  block={size.ctaBlock}
                  unified={isUnified}
                />
              ) : null}
              {model.secondaryCta ? (
                <EntityCtaControl
                  cta={model.secondaryCta}
                  block={size.ctaBlock}
                  unified={isUnified}
                />
              ) : null}
            </>
          ) : isUnified ? (
            // Unified anatomy: full-width 36px CTA at the bottom of every
            // card. The CTA is a visual cue for the whole-card link — when
            // neither the card nor the CTA has a target, it degrades to
            // plain muted meta text instead of button chrome.
            model.cta ? (
              model.cta.disabled || (!model.cta.href && !cardHref) ? (
                <span className='flex h-9 w-full items-center text-xs text-tertiary-token'>
                  {model.cta.label}
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex h-9 w-full shrink-0 items-center justify-center rounded-full bg-btn-primary px-4 text-xs font-[560] text-btn-primary-foreground transition-colors duration-subtle group-hover:bg-btn-primary-hover'
                  )}
                >
                  {model.cta.label}
                </span>
              )
            ) : null
          ) : (
            <>
              {model.price ? (
                <div className='min-w-0'>
                  <span className='text-sm font-[680] text-primary-token'>
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
            </>
          )}
        </div>
      </div>
    </CardShell>
  );
}
