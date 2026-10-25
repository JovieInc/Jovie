'use client';

import type {
  KeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { DialEngine, type DialState } from '@/lib/dial/dial-engine';
import {
  ROW_STEP_PX,
  rowIsTappable,
  rowLayout,
  WINDOW_RADIUS,
} from '@/lib/dial/dial-layout';
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
  /**
   * Marketing demo: no outbound link, no activation callback (so no click
   * tracking), and Stream Now only shows a quiet "demo" note. Unless
   * `reveal: false`, one short fling plays when the dial first scrolls into
   * view (not under reduced motion); any touch, wheel or key stops it.
   */
  readonly demo?: boolean | { readonly reveal?: boolean };
}

const TAP_SLOP_PX = 6;
const PAGE_STEP = 5;
const MIN_HAPTIC_GAP_MS = 24;
const MIN_PULSE_GAP_MS = 90;
const TYPEAHEAD_RESET_MS = 700;
const REVEAL_DELAY_MS = 450;
const REVEAL_DISTANCE = 7;
const DEMO_NOTE_MS = 2200;
const NO_HAPTIC = Symbol('no-haptic');
export const DIAL_HINT_SEEN_KEY = 'jovie:dial-hint-seen';

function readHintSeen(): boolean {
  try {
    return globalThis.localStorage.getItem(DIAL_HINT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHintSeen(): void {
  try {
    globalThis.localStorage.setItem(DIAL_HINT_SEEN_KEY, '1');
  } catch {}
}

interface Gesture {
  readonly id: number;
  readonly startY: number;
  moved: boolean;
  readonly caught: boolean;
}

function normalizeWheel(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * ROW_STEP_PX;
  if (event.deltaMode === 2) return event.deltaY * ROW_STEP_PX * 3;
  return event.deltaY;
}

function isWheelNotch(event: WheelEvent): boolean {
  if (event.deltaMode === 1) return true;
  const magnitude = Math.abs(event.deltaY);
  return (
    Number.isInteger(event.deltaY) &&
    magnitude >= 100 &&
    (magnitude % 100 === 0 || magnitude % 120 === 0)
  );
}

const browserScheduler = {
  now: () => performance.now(),
  request: (callback: (time: number) => void) =>
    requestAnimationFrame(callback),
  cancel: (handle: number) => cancelAnimationFrame(handle),
};

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
  demo = false,
}: Readonly<ActionDialProps>) {
  const isDemo = demo !== false;
  const revealEnabled = isDemo && (demo === true || demo.reveal !== false);
  const count = options.length;
  const selectedIndex = Math.max(
    0,
    options.findIndex(option => option.id === selectedId)
  );
  const uid = useId();
  const reducedMotion = useReducedMotion();
  const { selection: selectionHaptic } = useHapticFeedback();

  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [restIndex, setRestIndex] = useState(selectedIndex);
  // Hidden until storage says this device has not used the dial yet (no flash).
  const [showHint, setShowHint] = useState(false);
  const hintId = `${uid}-hint`;
  const hintGlyphRef = useRef<HTMLSpanElement | null>(null);
  const usedRef = useRef(false);
  const [demoNote, setDemoNote] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealStageRef = useRef<'idle' | 'out' | 'back' | 'done'>('idle');
  const demoNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rootRef = useRef<HTMLFieldSetElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const actionRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DialEngine | null>(null);
  const rowRefs = useRef(new Map<number, HTMLElement>());
  const iconRefs = useRef(new Map<number, HTMLElement>());
  const tappableRef = useRef(new WeakMap<HTMLElement, boolean>());
  const positionRef = useRef(selectedIndex);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);
  const suppressHapticRef = useRef<symbol | null>(null);
  const lastHapticRef = useRef(0);
  const lastPulseRef = useRef(0);
  const activeIndexRef = useRef(selectedIndex);
  const typeaheadRef = useRef({ text: '', at: 0 });

  const live = useRef({ options, selectedId, onSelect, selectionHaptic });
  useLayoutEffect(() => {
    live.current = { options, selectedId, onSelect, selectionHaptic };
  });

  const markUsed = useCallback(() => {
    if (usedRef.current) return;
    usedRef.current = true;
    setShowHint(false);
    writeHintSeen();
  }, []);

  useEffect(
    () => () => {
      if (demoNoteTimerRef.current) clearTimeout(demoNoteTimerRef.current);
    },
    []
  );

  /** A touch, wheel or key hands the dial to the user for good. */
  const cancelReveal = useCallback(() => {
    revealStageRef.current = 'done';
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (count < 2 || readHintSeen()) {
      usedRef.current = true;
      return;
    }
    setShowHint(true);
    const glyph = hintGlyphRef.current;
    const calm = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (glyph && !calm && typeof glyph.animate === 'function') {
      glyph.animate(
        [
          { transform: 'translate3d(0,0,0)' },
          { transform: 'translate3d(0,-4px,0)', offset: 0.35 },
          { transform: 'translate3d(0,3px,0)', offset: 0.7 },
          { transform: 'translate3d(0,0,0)' },
        ],
        { duration: 1100, easing: 'ease-in-out', delay: 600 }
      );
    }
  }, [count]);

  const paint = useCallback((position: number, state: DialState) => {
    positionRef.current = position;
    const root = rootRef.current;
    if (root) {
      root.dataset.position = String(Number(position.toFixed(3)));
      root.dataset.state = state;
    }
    for (const [index, row] of rowRefs.current) {
      const distance = index - position;
      const layout = rowLayout(distance);
      row.style.transform = `translate3d(0, ${layout.y}px, 0) scale(${layout.scale})`;
      row.style.opacity = String(layout.opacity);
      const tappable = rowIsTappable(distance);
      if (tappableRef.current.get(row) !== tappable) {
        tappableRef.current.set(row, tappable);
        row.style.pointerEvents = tappable ? 'auto' : 'none';
      }
    }
    for (const [index, icon] of iconRefs.current) {
      const distance = index - position;
      icon.style.transform = `translate3d(0, ${distance * 100}%, 0)`;
      icon.style.opacity = Math.abs(distance) < 1 ? '1' : '0';
    }
  }, []);

  const pulse = useCallback(() => {
    const action = actionRef.current;
    const now = performance.now();
    if (
      !action ||
      typeof action.animate !== 'function' ||
      now - lastPulseRef.current < MIN_PULSE_GAP_MS
    ) {
      return;
    }
    lastPulseRef.current = now;
    action.animate(
      [
        { transform: 'scale(0.972)', opacity: 0.86 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 140, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    );
  }, []);

  useLayoutEffect(() => {
    if (count < 2) return;
    const engine = new DialEngine({
      count,
      position: positionRef.current,
      reducedMotion,
      scheduler: browserScheduler,
      onFrame: paint,
      onIndexChange: index => {
        activeIndexRef.current = index;
        setActiveIndex(index);
        if (suppressHapticRef.current === NO_HAPTIC) return;
        const now = performance.now();
        // The scripted reveal is not a user gesture: no haptic for it.
        const scripted =
          revealStageRef.current === 'out' || revealStageRef.current === 'back';
        if (!scripted && now - lastHapticRef.current >= MIN_HAPTIC_GAP_MS) {
          lastHapticRef.current = now;
          // Selection tick per item (vibrate on Android; native engine in the iOS app).
          live.current.selectionHaptic();
        }
        if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          pulse();
        }
      },
      onRest: index => {
        setRestIndex(index);
        if (revealStageRef.current === 'out') {
          revealStageRef.current = 'back';
          revealTimerRef.current = setTimeout(() => {
            engineRef.current?.flingTo(0);
          }, 420);
        } else if (revealStageRef.current === 'back') {
          revealStageRef.current = 'done';
        }
        const option = live.current.options[index];
        if (option && option.id !== live.current.selectedId) {
          live.current.onSelect(option.id);
        }
      },
    });
    engineRef.current = engine;
    paint(positionRef.current, 'idle');
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [count, reducedMotion, paint, pulse]);

  useLayoutEffect(() => {
    paint(positionRef.current, engineRef.current?.currentState ?? 'idle');
  }, [activeIndex, paint]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || engine.currentState !== 'idle') return;
    if (engine.index === selectedIndex) return;
    suppressHapticRef.current = NO_HAPTIC;
    engine.jumpTo(selectedIndex);
    suppressHapticRef.current = null;
    activeIndexRef.current = selectedIndex;
    setActiveIndex(selectedIndex);
    setRestIndex(selectedIndex);
  }, [selectedIndex]);

  // Demo reveal: one short fling when first scrolled into view, then back to
  // the first service. Any user input cancels it (see cancelReveal).
  useEffect(() => {
    const root = rootRef.current;
    if (!revealEnabled || !root || count < 3 || reducedMotion) return;
    if (revealStageRef.current !== 'idle') return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        revealTimerRef.current = setTimeout(() => {
          const engine = engineRef.current;
          if (!engine || engine.currentState !== 'idle') return;
          if (revealStageRef.current !== 'idle') return;
          revealStageRef.current = 'out';
          engine.flingTo(Math.min(count - 1, REVEAL_DISTANCE));
        }, REVEAL_DELAY_MS);
      },
      { threshold: 0.6 }
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, [revealEnabled, count, reducedMotion]);

  // Non-passive so the wheel can claim the scroll, only while the dial can move.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || count < 2) return;
    const onWheel = (event: WheelEvent) => {
      const engine = engineRef.current;
      if (!engine || event.ctrlKey) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const delta = normalizeWheel(event);
      if (delta === 0) return;
      const position = engine.currentPosition;
      const atStart = position <= 0 && delta < 0;
      const atEnd = position >= count - 1 && delta > 0;
      if ((atStart || atEnd) && engine.currentState === 'idle') return;
      event.preventDefault();
      cancelReveal();
      markUsed();
      if (isWheelNotch(event)) {
        engine.moveTo(engine.targetIndex + Math.sign(delta));
      } else {
        engine.wheel(delta / ROW_STEP_PX, event.timeStamp);
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [count, markUsed, cancelReveal]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLFieldSetElement>) => {
      const engine = engineRef.current;
      if (!engine || gestureRef.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      cancelReveal();
      const caught = engine.currentState === 'release';
      suppressClickRef.current = false;
      gestureRef.current = {
        id: event.pointerId,
        startY: event.clientY,
        moved: false,
        caught,
      };
      engine.grab(event.timeStamp);
    },
    [cancelReveal]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLFieldSetElement>) => {
      const gesture = gestureRef.current;
      const engine = engineRef.current;
      if (!gesture || !engine || gesture.id !== event.pointerId) return;
      const travel = event.clientY - gesture.startY;
      if (!gesture.moved) {
        if (Math.abs(travel) <= TAP_SLOP_PX) return;
        gesture.moved = true;
        markUsed();
        // Capture only once it is a drag so a tap still reaches the link or row.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      engine.drag(-travel / ROW_STEP_PX, event.timeStamp);
    },
    [markUsed]
  );

  const endGesture = useCallback(
    (event: ReactPointerEvent<HTMLFieldSetElement>, canceled: boolean) => {
      const gesture = gestureRef.current;
      const engine = engineRef.current;
      if (!gesture || !engine || gesture.id !== event.pointerId) return;
      gestureRef.current = null;
      if (gesture.moved || gesture.caught) {
        // A drag, or a touch that only stopped momentum, must not also activate.
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 60);
      }
      if (canceled) engine.cancel(event.timeStamp);
      else engine.release(event.timeStamp);
    },
    []
  );

  const moveBy = useCallback((delta: number) => {
    const engine = engineRef.current;
    if (engine) engine.moveTo(engine.targetIndex + delta);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const engine = engineRef.current;
    if (!engine || event.altKey || event.ctrlKey || event.metaKey) return;
    cancelReveal();
    switch (event.key) {
      case 'ArrowDown':
        moveBy(1);
        break;
      case 'ArrowUp':
        moveBy(-1);
        break;
      case 'PageDown':
        moveBy(PAGE_STEP);
        break;
      case 'PageUp':
        moveBy(-PAGE_STEP);
        break;
      case 'Home':
        engine.moveTo(0);
        break;
      case 'End':
        engine.moveTo(count - 1);
        break;
      default: {
        if (event.key.length !== 1 || event.key === ' ') return;
        const now = event.timeStamp;
        const buffer = typeaheadRef.current;
        buffer.text =
          now - buffer.at > TYPEAHEAD_RESET_MS
            ? event.key.toLowerCase()
            : buffer.text + event.key.toLowerCase();
        buffer.at = now;
        const from = engine.targetIndex + (buffer.text.length === 1 ? 1 : 0);
        for (let step = 0; step < count; step++) {
          const index = (from + step) % count;
          if (options[index]?.label.toLowerCase().startsWith(buffer.text)) {
            markUsed();
            engine.moveTo(index);
            break;
          }
        }
        return;
      }
    }
    markUsed();
    event.preventDefault();
  };

  const active = options[activeIndex] ?? options[0];
  const first = Math.max(0, activeIndex - WINDOW_RADIUS);
  const last = Math.min(count - 1, activeIndex + WINDOW_RADIUS);
  const windowed = useMemo(
    () =>
      options
        .slice(first, last + 1)
        .map((option, i) => [first + i, option] as const),
    [options, first, last]
  );

  if (!active) return null;

  const position = activeIndex;
  const actionIcon =
    count < 2 || !active.icon ? (
      active.icon
    ) : (
      <span
        className='relative h-5 w-5 shrink-0 overflow-hidden'
        aria-hidden='true'
        data-testid='action-dial-icon-track'
      >
        {windowed.map(([index, option]) =>
          Math.abs(index - activeIndex) <= 2 && option.icon ? (
            <span
              key={option.id}
              ref={node => {
                if (node) iconRefs.current.set(index, node);
                else iconRefs.current.delete(index);
              }}
              className='absolute inset-0 will-change-transform'
              style={{
                transform: `translate3d(0, ${(index - position) * 100}%, 0)`,
                opacity: Math.abs(index - position) < 1 ? 1 : 0,
              }}
              data-testid={`action-dial-icon-${option.id}`}
            >
              {option.icon}
            </span>
          ) : null
        )}
      </span>
    );

  const handleActivate = () => {
    if (isDemo) {
      setDemoNote(true);
      if (demoNoteTimerRef.current) clearTimeout(demoNoteTimerRef.current);
      demoNoteTimerRef.current = setTimeout(
        () => setDemoNote(false),
        DEMO_NOTE_MS
      );
      return;
    }
    const chosen = options[activeIndexRef.current] ?? active;
    onActivate?.(chosen.id);
  };

  return (
    <fieldset
      ref={rootRef}
      className={cn(
        'm-0 w-full touch-none select-none border-0 p-0',
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={event => endGesture(event, false)}
      onPointerCancel={event => endGesture(event, true)}
      data-testid='action-dial'
      data-position={selectedIndex}
      data-state='idle'
    >
      <legend className='sr-only'>{groupLabel}</legend>
      <div
        className={cn(
          'relative overflow-hidden',
          count === 1 ? 'h-19 min-h-19' : 'h-53 min-h-53'
        )}
      >
        {count > 1 ? (
          <div
            ref={listboxRef}
            role='listbox'
            tabIndex={0}
            aria-label={groupLabel}
            aria-orientation='vertical'
            aria-activedescendant={`${uid}-${activeIndex}`}
            aria-describedby={hintId}
            onKeyDown={handleKeyDown}
            className='absolute inset-0 rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-focus'
            data-testid='action-dial-listbox'
          >
            {windowed.map(([index, option]) => {
              const layout = rowLayout(index - position);
              return (
                <div
                  key={option.id}
                  id={`${uid}-${index}`}
                  ref={node => {
                    if (node) rowRefs.current.set(index, node);
                    else rowRefs.current.delete(index);
                  }}
                  role='option'
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  aria-posinset={index + 1}
                  aria-setsize={count}
                  data-dial-offset={index - activeIndex}
                  className='absolute inset-x-3 top-21 flex h-11 items-center justify-center gap-2 rounded-full text-sm text-foreground will-change-transform'
                  style={{
                    transform: `translate3d(0, ${layout.y}px, 0) scale(${layout.scale})`,
                    opacity: layout.opacity,
                    pointerEvents: rowIsTappable(index - position)
                      ? 'auto'
                      : 'none',
                  }}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    markUsed();
                    engineRef.current?.moveTo(index);
                    listboxRef.current?.focus({ preventScroll: true });
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    engineRef.current?.moveTo(index);
                  }}
                >
                  {option.icon ? (
                    <span aria-hidden='true'>{option.icon}</span>
                  ) : null}
                  <span>{option.label}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <div
          ref={actionRef}
          className={cn(
            'absolute inset-x-3 z-10',
            count === 1 ? 'top-3' : 'top-20'
          )}
        >
          <SmartLinkProviderButton
            label={actionLabel}
            icon={actionIcon}
            href={isDemo ? undefined : active.href}
            providerKey={active.id}
            primary
            disabled={disabled}
            ariaLabel={`${actionLabel} with ${active.label}${isDemo ? ' (demo, no link)' : ''}`}
            className='w-full'
            onClick={event => {
              if (suppressClickRef.current) {
                event.preventDefault();
                return;
              }
              handleActivate();
            }}
          />
        </div>
      </div>
      {/* JOV-INV-019 image-contrast: text-muted-foreground resolves to
          text-secondary-token, which measures 4.48:1 against a real photo
          background on the pay hint (just under the 4.5:1 floor); bump one
          rung to text-primary-token for margin, same fix as the tab-bar
          scrim label. */}
      {count > 1 ? (
        <p id={hintId} className='sr-only'>
          {hint}
        </p>
      ) : null}
      {count > 1 ? (
        <div
          className='relative mt-1 flex h-5 items-center justify-center'
          aria-hidden='true'
          data-testid='action-dial-hint'
          data-visible={showHint}
        >
          {isDemo ? (
            <span
              className={cn(
                'absolute text-xs text-primary-token transition-opacity duration-normal motion-reduce:transition-none',
                demoNote ? 'opacity-100' : 'opacity-0'
              )}
              role='status'
            >
              {demoNote ? 'This is a demo. No link opens.' : ''}
            </span>
          ) : null}
          <span
            ref={hintGlyphRef}
            className={cn(
              'text-tertiary-token transition-opacity duration-normal motion-reduce:transition-none',
              showHint && !demoNote ? 'opacity-100' : 'opacity-0'
            )}
          >
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='1.75'
              strokeLinecap='round'
              strokeLinejoin='round'
              className='h-4 w-4'
              aria-hidden='true'
            >
              {/* Lucide chevrons-up-down geometry; inlined so the dial has no icon-package dependency. */}
              <path d='m7 15 5 5 5-5' />
              <path d='m7 9 5-5 5 5' />
            </svg>
          </span>
        </div>
      ) : (
        <p id={hintId} className='mt-1 text-center text-xs text-primary-token'>
          {hint}
        </p>
      )}
      <p className='sr-only' role='status' aria-live='polite'>
        {(options[restIndex] ?? active).label} selected
      </p>
    </fieldset>
  );
}
