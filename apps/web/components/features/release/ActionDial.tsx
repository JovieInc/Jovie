'use client';

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { computeRatePercent } from '@/lib/analytics/metrics';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { SmartLinkProviderButton } from './SmartLinkProviderButton';

export interface ActionDialOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly href?: string;
}

interface ActionDialProps {
  readonly options: readonly ActionDialOption[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly actionLabel: string;
  readonly groupLabel: string;
  readonly onActivate?: (id: string) => void;
  readonly hint?: string;
  readonly className?: string;
  readonly disabled?: boolean;
}

const SNAP_MS = 150;
const SWIPE_STEP_PX = 68;
const SWIPE_THRESHOLD_PX = 26;

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

function relativeIndex(
  index: number,
  activeIndex: number,
  count: number,
  tieSign: number
): number {
  const forward = wrapIndex(index - activeIndex, count);
  if (forward === count / 2) return tieSign * forward;
  return forward > count / 2 ? forward - count : forward;
}

export function ActionDial({
  options,
  selectedId,
  onSelect,
  actionLabel,
  groupLabel,
  onActivate,
  hint = 'Swipe to switch. Your choice is remembered.',
  className,
  disabled = false,
}: Readonly<ActionDialProps>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.id === selectedId)
  );
  const [visualIndex, setVisualIndex] = useState(selectedIndex);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [settledTieSign, setSettledTieSign] = useState(1);
  const reducedMotion = useReducedMotion();
  const pointerRef = useRef<{
    id: number;
    y: number;
    tapOffset: number | null;
  } | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const visualIndexRef = useRef(visualIndex);
  const { selection: selectionHaptic } = useHapticFeedback();

  useEffect(() => {
    if (snapTimerRef.current) return;
    setVisualIndex(selectedIndex);
    visualIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(
    () => () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    },
    []
  );

  const commit = useCallback(
    (index: number) => {
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
      const option = options[index];
      if (!option || option.id === selectedId) return;
      onSelect(option.id);
    },
    [onSelect, options, selectedId]
  );

  const select = useCallback(
    (index: number) => {
      if (options.length < 2) return;
      const next = wrapIndex(index, options.length);
      if (options[next]?.id === options[visualIndexRef.current]?.id) return;
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      setSettledTieSign(index > visualIndexRef.current ? -1 : 1);
      setVisualIndex(next);
      visualIndexRef.current = next;
      // Vibration requires a live user gesture on supporting browsers. The
      // preference itself is persisted only after the reel settles.
      selectionHaptic();
      if (reducedMotion) {
        commit(next);
      } else {
        snapTimerRef.current = setTimeout(() => commit(next), SNAP_MS);
      }
    },
    [commit, options, reducedMotion, selectionHaptic]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLFieldSetElement>) => {
      if (options.length < 2) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      // Leave the fixed action alone so its native link/button activation works.
      if (target?.closest('[data-dsp-provider]')) return;
      const row = target?.closest<HTMLElement>('[data-dial-offset]');
      const tapOffset = row ? Number(row.dataset.dialOffset) : null;
      pointerRef.current = { id: event.pointerId, y: event.clientY, tapOffset };
      setIsDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [options.length]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLFieldSetElement>) => {
      if (pointerRef.current?.id !== event.pointerId) return;
      setDragY(
        Math.max(-84, Math.min(84, event.clientY - pointerRef.current.y))
      );
    },
    []
  );

  const finishPointer = useCallback(
    (event: PointerEvent<HTMLFieldSetElement>, canceled: boolean) => {
      const start = pointerRef.current;
      if (start?.id !== event.pointerId) return;
      pointerRef.current = null;
      const distance = event.clientY - start.y;
      if (Number.isFinite(distance) && distance !== 0)
        setSettledTieSign(distance > 0 ? -1 : 1);
      setDragY(0);
      setIsDragging(false);
      if (canceled) return;
      if (!Number.isFinite(distance)) return;
      if (Math.abs(distance) < SWIPE_THRESHOLD_PX) {
        if (start.tapOffset !== null) {
          suppressClickRef.current = true;
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
          select(visualIndexRef.current + start.tapOffset);
        }
        return;
      }
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      // One swipe settles the adjacent provider actually shown in the track.
      select(visualIndexRef.current + (distance < 0 ? 1 : -1));
    },
    [select]
  );

  const active = options[visualIndex] ?? options[0];
  const actionIcon =
    reducedMotion || options.length < 2 || !active?.icon ? (
      active?.icon
    ) : (
      <span
        className='relative h-5 w-5 shrink-0 overflow-hidden'
        aria-hidden='true'
        data-testid='action-dial-icon-track'
      >
        {options.map((option, index) => {
          const tieSign =
            isDragging && dragY !== 0 ? (dragY > 0 ? -1 : 1) : settledTieSign;
          const offset = relativeIndex(
            index,
            visualIndex,
            options.length,
            tieSign
          );
          return option.icon ? (
            <span
              key={option.id}
              className={cn(
                'absolute inset-0 transition duration-subtle ease-subtle motion-reduce:transition-none',
                isDragging && 'transition-none',
                Math.abs(offset) <= 1 ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                transform: `translateY(${offset * 100 + computeRatePercent(dragY, SWIPE_STEP_PX, 12)}%)`,
              }}
              data-testid={`action-dial-icon-${option.id}`}
            >
              {option.icon}
            </span>
          ) : null;
        })}
      </span>
    );
  const visible = useMemo(() => {
    if (options.length === 0) return [];
    const offsets =
      options.length === 1
        ? []
        : options.length === 2
          ? [1]
          : options.length === 3
            ? [-1, 1]
            : [-2, -1, 1, 2];
    return offsets.map(offset => ({
      offset,
      option: options[wrapIndex(visualIndex + offset, options.length)]!,
    }));
  }, [options, visualIndex]);

  if (!active) return null;

  const handleActivate = () => {
    if (snapTimerRef.current) commit(visualIndexRef.current);
    onActivate?.(options[visualIndexRef.current]?.id ?? active.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      select(visualIndexRef.current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      select(visualIndexRef.current - 1);
    }
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the fieldset groups focusable service buttons and tracks swipes across the whole dial.
    <fieldset
      className={cn(
        'm-0 w-full touch-none select-none border-0 p-0',
        className
      )}
      onKeyDown={handleKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={event => finishPointer(event, false)}
      onPointerCancel={event => finishPointer(event, true)}
      data-testid='action-dial'
    >
      <legend className='sr-only'>{groupLabel}</legend>
      <div
        className={cn(
          'relative overflow-hidden',
          options.length === 1 ? 'h-19' : 'h-53'
        )}
      >
        <div
          className={cn(
            'absolute inset-0 transition-transform duration-subtle ease-out motion-reduce:transition-none',
            isDragging && 'transition-none'
          )}
          style={{ transform: `translateY(${dragY}px)` }}
        >
          {visible.map(({ offset, option }) => {
            const position =
              offset === -2
                ? 'top-0 h-6 opacity-20'
                : offset === -1
                  ? 'top-7 h-11 opacity-55'
                  : offset === 1
                    ? 'top-35 h-11 opacity-55'
                    : 'top-47 h-6 opacity-20';
            const content = (
              <>
                {Math.abs(offset) === 1 && option.icon ? (
                  <span aria-hidden='true'>{option.icon}</span>
                ) : null}
                <span>{option.label}</span>
              </>
            );
            return Math.abs(offset) === 1 ? (
              <button
                key={offset}
                type='button'
                className={cn(
                  'absolute inset-x-3 flex items-center justify-center gap-2 rounded-full text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  position
                )}
                aria-label={`Select ${option.label}`}
                data-dial-offset={offset}
                onClick={() => {
                  if (!suppressClickRef.current) {
                    select(visualIndexRef.current + offset);
                  }
                }}
              >
                {content}
              </button>
            ) : (
              <div
                key={offset}
                className={cn(
                  'absolute inset-x-3 flex items-center justify-center text-xs text-muted-foreground',
                  position
                )}
                aria-hidden='true'
              >
                {content}
              </div>
            );
          })}
        </div>
        <SmartLinkProviderButton
          label={actionLabel}
          icon={actionIcon}
          href={active.href}
          providerKey={active.id}
          primary
          disabled={disabled}
          ariaLabel={`${actionLabel} with ${active.label}`}
          className={cn(
            'absolute inset-x-3 z-10 w-auto',
            options.length === 1 ? 'top-3' : 'top-20'
          )}
          onClick={event => {
            if (suppressClickRef.current) {
              event.preventDefault();
              return;
            }
            handleActivate();
          }}
        />
      </div>
      {/* JOV-INV-019 image-contrast: text-muted-foreground resolves to
          text-secondary-token, which measures 4.48:1 against a real photo
          background on the pay hint (just under the 4.5:1 floor); bump one
          rung to text-primary-token for margin, same fix as the tab-bar
          scrim label. */}
      <p className='mt-1 text-center text-xs text-primary-token'>{hint}</p>
      <p className='sr-only' role='status' aria-live='polite'>
        {active.label} selected
      </p>
    </fieldset>
  );
}
