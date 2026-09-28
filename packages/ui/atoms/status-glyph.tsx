'use client';

import { cn } from '@jovie/ui/lib/utils';
import type * as React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

/**
 * StatusGlyph — the single owner for status-as-glyph (Pen `jAcP1`
 * atom.status-pill; design decision D5, JOV-6841).
 *
 * Glyph + optional label + tooltip. No visible status word is rendered
 * unless `label` is passed; the state is always exposed via `aria-label`
 * and the tooltip. Red and green are reserved for `error` and `success`.
 *
 * Fill states: empty / quarter / half / three-quarter / full / check / x.
 * Specialized fills (task stage `F0ZYd`, presence `Y8zgo`) are selections
 * of this state map, not separate components.
 */

export const STATUS_GLYPH_STATES = [
  'todo',
  'in_progress',
  'in_review',
  'done',
  'canceled',
  'blocked',
  'warning',
  'success',
  'error',
] as const;

export type StatusGlyphState = (typeof STATUS_GLYPH_STATES)[number];
export type StatusGlyphSize = 'sm' | 'md';
export type StatusGlyphFill =
  | 'empty'
  | 'quarter'
  | 'half'
  | 'three-quarter'
  | 'full'
  | 'check'
  | 'x';

interface StatusGlyphStateSpec {
  readonly fill: StatusGlyphFill;
  readonly tone: string;
  readonly label: string;
  /** Dashed ring for the empty fill (blocked reads as "contained", not blank). */
  readonly dashed?: boolean;
}

export const STATUS_GLYPH_STATE_SPECS: Record<
  StatusGlyphState,
  StatusGlyphStateSpec
> = {
  todo: { fill: 'empty', tone: 'text-tertiary-token', label: 'To do' },
  in_progress: { fill: 'half', tone: 'text-info', label: 'In progress' },
  in_review: {
    fill: 'three-quarter',
    tone: 'text-accent',
    label: 'In review',
  },
  done: { fill: 'check', tone: 'text-secondary-token', label: 'Done' },
  canceled: { fill: 'x', tone: 'text-tertiary-token', label: 'Canceled' },
  blocked: {
    fill: 'empty',
    tone: 'text-warning',
    label: 'Blocked',
    dashed: true,
  },
  warning: { fill: 'full', tone: 'text-warning', label: 'Warning' },
  success: { fill: 'check', tone: 'text-success', label: 'Success' },
  error: { fill: 'x', tone: 'text-error', label: 'Error' },
};

const SIZE_CLASS: Record<StatusGlyphSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

const VIEW = 16;
const CENTER = VIEW / 2;
const RING_R = 6.25;
const FILL_R = 4.75;
const STROKE = 1.5;

/** Pie-sector path for a fractional fill, sweeping clockwise from 12 o'clock. */
function sectorPath(fraction: number): string {
  const angle = (fraction * 360 - 90) * (Math.PI / 180);
  const x = CENTER + FILL_R * Math.cos(angle);
  const y = CENTER + FILL_R * Math.sin(angle);
  const largeArc = fraction > 0.5 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${CENTER} ${CENTER - FILL_R} A ${FILL_R} ${FILL_R} 0 ${largeArc} 1 ${x} ${y} Z`;
}

function GlyphMark({
  spec,
  size,
}: {
  readonly spec: StatusGlyphStateSpec;
  readonly size: StatusGlyphSize;
}) {
  const ring = (
    <circle
      cx={CENTER}
      cy={CENTER}
      r={RING_R}
      fill='none'
      stroke='currentColor'
      strokeWidth={STROKE}
      strokeDasharray={spec.dashed ? '2.6 2' : undefined}
    />
  );
  return (
    <svg
      aria-hidden='true'
      focusable='false'
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={cn('shrink-0', SIZE_CLASS[size], spec.tone)}
      data-fill={spec.fill}
    >
      {spec.fill === 'empty' ? (
        ring
      ) : spec.fill === 'full' ? (
        <circle cx={CENTER} cy={CENTER} r={FILL_R} fill='currentColor' />
      ) : spec.fill === 'check' ? (
        <>
          <circle cx={CENTER} cy={CENTER} r={FILL_R} fill='currentColor' />
          <path
            d='M 5.4 8.2 L 7.3 10.1 L 10.7 6.1'
            fill='none'
            stroke='var(--color-bg-primary, Canvas)'
            strokeWidth={1.4}
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </>
      ) : spec.fill === 'x' ? (
        <>
          {ring}
          <path
            d='M 5.8 5.8 L 10.2 10.2 M 10.2 5.8 L 5.8 10.2'
            stroke='currentColor'
            strokeWidth={STROKE}
            strokeLinecap='round'
          />
        </>
      ) : (
        <>
          {ring}
          <path
            d={sectorPath(
              spec.fill === 'quarter' ? 0.25 : spec.fill === 'half' ? 0.5 : 0.75
            )}
            fill='currentColor'
          />
        </>
      )}
    </svg>
  );
}

export interface StatusGlyphProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Semantic state; selects the glyph fill and tone. */
  readonly state: StatusGlyphState;
  readonly size?: StatusGlyphSize;
  /**
   * Optional visible label. When omitted, the state is conveyed only by the
   * glyph, its `aria-label`, and the tooltip — never by a visible word.
   */
  readonly label?: string;
  /**
   * Overrides the tooltip + `aria-label` copy when a domain-specific phrase
   * is clearer than the generic state name (e.g. "Auto-synced provider
   * link"). Never rendered visibly.
   */
  readonly tooltipLabel?: string;
}

export function StatusGlyph({
  state,
  size = 'md',
  label,
  tooltipLabel,
  className,
  ...props
}: StatusGlyphProps) {
  const spec = STATUS_GLYPH_STATE_SPECS[state];
  const accessibleLabel = tooltipLabel ?? label ?? spec.label;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role='img'
            aria-label={accessibleLabel}
            data-status-glyph={state}
            className={cn(
              'inline-flex items-center gap-1.5 align-middle',
              className
            )}
            {...props}
          >
            <GlyphMark spec={spec} size={size} />
            {label ? (
              <span className='text-2xs leading-none text-secondary-token'>
                {label}
              </span>
            ) : null}
          </span>
        </TooltipTrigger>
        <TooltipContent side='top'>{accessibleLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
