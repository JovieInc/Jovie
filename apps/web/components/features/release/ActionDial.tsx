'use client';

import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
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
}

const SNAP_MS = 150;
const SWIPE_STEP_PX = 68;
const SWIPE_THRESHOLD_PX = 26;

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

function prefersReducedMotion(): boolean {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
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
}: Readonly<ActionDialProps>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.id === selectedId)
  );
  const [visualIndex, setVisualIndex] = useState(selectedIndex);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
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
      setVisualIndex(next);
      visualIndexRef.current = next;
      // Vibration requires a live user gesture on supporting browsers. The
      // preference itself is persisted only after the reel settles.
      selectionHaptic();
      if (prefersReducedMotion()) {
        commit(next);
      } else {
        snapTimerRef.current = setTimeout(() => commit(next), SNAP_MS);
      }
    },
    [commit, options, selectionHaptic]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLFieldSetElement>) => {
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
    []
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
      setDragY(0);
      setIsDragging(false);
      if (canceled) return;
      const distance = event.clientY - start.y;
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
      const steps = Math.max(
        1,
        Math.min(3, Math.round(Math.abs(distance) / SWIPE_STEP_PX))
      );
      select(visualIndexRef.current + (distance < 0 ? steps : -steps));
    },
    [select]
  );

  const active = options[visualIndex] ?? options[0];
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
      <div className='relative h-53 overflow-hidden'>
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
          icon={active.icon}
          href={active.href}
          providerKey={active.id}
          primary
          ariaLabel={`${actionLabel} with ${active.label}`}
          className='absolute inset-x-3 top-20 z-10 w-[calc(100%-1.5rem)]'
          onClick={event => {
            if (suppressClickRef.current) {
              event.preventDefault();
              return;
            }
            handleActivate();
          }}
        />
      </div>
      <p className='text-muted-foreground mt-1 text-center text-xs'>{hint}</p>
      <p className='sr-only' role='status' aria-live='polite'>
        {active.label} selected
      </p>
    </fieldset>
  );
}
