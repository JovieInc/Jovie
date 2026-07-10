'use client';

/**
 * Marketing homepage AI section: Variant F chat composer demo.
 *
 * Self-contained — no live query hooks, no user auth.
 * Autoplay cycles: empty (2s) → typing (3s) → entity (4s) → loop.
 * Pause on hover / keypress; static on prefers-reduced-motion.
 *
 * Reuses motion tokens from chat-motion.ts. Mirrors the in-app state machine
 * without importing any live data or session hooks.
 */

import { Music2, Pause, Play, Send } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useReducer, useRef } from 'react';

import { TRANSITION_SURFACE } from '@/components/jovie/components/chat-motion';
import {
  DEMO_RELEASE_ACTIONS,
  DEMO_RELEASES,
  type DemoStat,
  MIDNIGHT_RUN_STATS,
  PHASE_EMPTY_DURATION,
  PHASE_ENTITY_DURATION,
  PHASE_TYPING_DURATION,
  RESUME_DELAY_AFTER_HOVER,
  TYPEWRITER_CHAR_INTERVAL,
  TYPEWRITER_QUERY,
} from '@/data/homeComposerHeroData';
import { SYSTEM_B_RADIUS_PX } from '@/lib/design/system-b-radius';
import { cn } from '@/lib/utils';

// ─── Design constants (match in-app composer exactly) ─────────────────────

const SURFACE_BG =
  'linear-gradient(180deg, rgba(255,255,255,0.018) 0%, transparent 40%), var(--color-bg-surface-2)';

const SEND_BTN_BG =
  'linear-gradient(180deg, var(--color-bg-primary) 0%, var(--color-bg-base) 100%)';

// ─── State machine ────────────────────────────────────────────────────────

type Phase = 'empty' | 'typing' | 'entity';

interface DemoState {
  readonly phase: Phase;
  readonly typedText: string;
  readonly isPaused: boolean;
}

type DemoAction =
  | { readonly type: 'start-typing' }
  | { readonly type: 'append-char'; readonly char: string }
  | { readonly type: 'show-entity' }
  | { readonly type: 'reset' }
  | { readonly type: 'sync-reduced-motion' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' };

function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'start-typing':
      return { ...state, phase: 'typing', typedText: '' };
    case 'append-char':
      return { ...state, typedText: state.typedText + action.char };
    case 'show-entity':
      return { ...state, phase: 'entity' };
    case 'reset':
      return { phase: 'empty', typedText: '', isPaused: false };
    case 'sync-reduced-motion':
      return {
        phase: 'entity',
        typedText: TYPEWRITER_QUERY,
        isPaused: true,
      };
    case 'pause':
      return { ...state, isPaused: true };
    case 'resume':
      return { ...state, isPaused: false };
  }
}

// ─── Geometry (mirrors geometryFor() in ChatInput.tsx) ────────────────────

type SurfaceMode = 'empty' | 'typing' | 'entity';

function geometryFor(mode: SurfaceMode) {
  // Mirror ChatInput geometryFor — System B radius tokens only (JOV-3532).
  if (mode === 'empty') return { borderRadius: SYSTEM_B_RADIUS_PX.pill };
  if (mode === 'typing') return { borderRadius: SYSTEM_B_RADIUS_PX['3xl'] };
  return { borderRadius: SYSTEM_B_RADIUS_PX['2xl'] };
}

// ─── Sub-components ───────────────────────────────────────────────────────

function SendButton() {
  return (
    <span
      aria-hidden='true'
      className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_0.5px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.18)]'
      style={{ background: SEND_BTN_BG }}
    >
      <Send
        size={13}
        strokeWidth={1.8}
        className='text-(--color-bg-surface-2) translate-x-[0.5px]'
        aria-hidden='true'
      />
    </span>
  );
}

interface InputRowProps {
  readonly value: string;
  readonly placeholder?: string;
}

function InputRow({
  value,
  placeholder = 'Ask Jovie for a release plan',
}: InputRowProps) {
  return (
    <div className='flex items-end gap-2 px-4 py-3'>
      <div className='flex min-h-7 flex-1 items-end'>
        <span
          className='min-h-7 w-full text-sm leading-[1.5] text-white/90 font-[Inter,system-ui,sans-serif] whitespace-pre-wrap break-words'
          aria-hidden='true'
        >
          {value || <span className='text-white/28'>{placeholder}</span>}
        </span>
      </div>
      {value ? <SendButton /> : null}
    </div>
  );
}

interface EntityPillProps {
  readonly label: string;
}

function EntityPill({ label }: EntityPillProps) {
  return (
    <span
      className='inline-flex items-center gap-1 rounded px-2 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
      style={{
        background: 'rgba(255,255,255,0.055)',
        fontFamily:
          'var(--font-display, "Satoshi", -apple-system, system-ui, sans-serif)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.6)',
      }}
    >
      <Music2 size={11} strokeWidth={1.4} aria-hidden='true' />
      {label}
    </span>
  );
}

interface TabBarProps {
  readonly activeTab: string;
}

const TABS = ['Releases', 'Tour', 'Artists'] as const;

function TabBar({ activeTab }: TabBarProps) {
  return (
    <div className='flex items-center gap-0 border-b border-white/[0.055] px-3'>
      {TABS.map(tab => (
        <span
          key={tab}
          className={cn(
            'px-2 py-2 text-xs cursor-default select-none',
            tab === activeTab
              ? 'border-b border-white/60 text-white/90 font-[500] -mb-px'
              : 'text-white/38'
          )}
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          {tab}
        </span>
      ))}
    </div>
  );
}

interface ReleaseRowProps {
  readonly label: string;
  readonly type: string;
  readonly year: string;
  readonly artBg: string;
  readonly isActive: boolean;
}

function ReleaseRow({ label, type, year, artBg, isActive }: ReleaseRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 cursor-default',
        isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.035]'
      )}
    >
      <div
        className='h-8 w-8 shrink-0 rounded-xs'
        style={{ background: artBg }}
        aria-hidden='true'
      />
      <div className='min-w-0 flex-1'>
        <p
          className='truncate text-app text-white/90 leading-tight'
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          {label}
        </p>
        <p
          className='text-2xs text-white/38 leading-tight mt-0.5'
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          {type} · {year}
        </p>
      </div>
    </div>
  );
}

interface StatStripProps {
  readonly stats: readonly DemoStat[];
}

function StatStrip({ stats }: StatStripProps) {
  return (
    <p
      className='text-2xs leading-relaxed text-white/40'
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {stats.map((stat, i) => (
        <span key={stat.key}>
          {i > 0 && (
            <span
              className='mx-1.5 inline-block h-1 w-1 rounded-full bg-white/20 align-middle'
              aria-hidden='true'
            />
          )}
          {stat.solid ? (
            <span className='rounded px-1.5 py-0.5 text-3xs font-[500] bg-white/10 text-white/70'>
              {stat.label}
            </span>
          ) : (
            <span>{stat.label}</span>
          )}
        </span>
      ))}
    </p>
  );
}

interface PreviewPaneProps {
  readonly artBg: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly stats: readonly DemoStat[];
}

function PreviewPane({ artBg, eyebrow, title, stats }: PreviewPaneProps) {
  return (
    <div className='flex flex-1 flex-col justify-center gap-3 px-5 py-5'>
      <div className='flex items-start gap-4'>
        <div
          className='h-18 w-18 shrink-0 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.4)]'
          style={{ background: artBg }}
          aria-hidden='true'
        />
        <div className='flex min-w-0 flex-col justify-center gap-1 pt-1'>
          <p
            className='text-3xs uppercase tracking-[0.08em] text-white/40'
            style={{
              fontFamily:
                'var(--font-display, "Satoshi", -apple-system, system-ui, sans-serif)',
              fontWeight: 600,
            }}
          >
            {eyebrow}
          </p>
          <p
            className='text-mid font-[500] text-white/90 leading-snug'
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            {title}
          </p>
          <StatStrip stats={stats} />
        </div>
      </div>
    </div>
  );
}

function ActionList() {
  return (
    <div className='home-composer-actions'>
      {DEMO_RELEASE_ACTIONS.map(action => (
        <div className='home-composer-action' key={action.key}>
          <div>
            <p>{action.label}</p>
            <span>{action.body}</span>
          </div>
          <strong>{action.status}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export function HomeComposerHero() {
  const prefersReducedMotion = useReducedMotion();

  const [state, dispatch] = useReducer(demoReducer, {
    phase: 'entity',
    typedText: TYPEWRITER_QUERY,
    isPaused: false,
  });

  const reducedMotionRef = useRef<boolean | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const pauseControlRef = useRef<HTMLButtonElement>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reducedMotion = !!prefersReducedMotion;
    if (reducedMotionRef.current === null) {
      reducedMotionRef.current = reducedMotion;
      if (reducedMotion) dispatch({ type: 'sync-reduced-motion' });
      return;
    }
    if (reducedMotionRef.current === reducedMotion) return;
    reducedMotionRef.current = reducedMotion;
    dispatch(
      reducedMotion ? { type: 'sync-reduced-motion' } : { type: 'reset' }
    );
  }, [prefersReducedMotion]);

  // ── Autoplay sequence ──────────────────────────────────────────────────

  useEffect(() => {
    if (prefersReducedMotion || state.isPaused) return;

    if (state.phase === 'empty') {
      const t = setTimeout(
        () => dispatch({ type: 'start-typing' }),
        PHASE_EMPTY_DURATION
      );
      return () => clearTimeout(t);
    }

    if (state.phase === 'typing') {
      const nextIdx = state.typedText.length;
      if (nextIdx < TYPEWRITER_QUERY.length) {
        const t = setTimeout(() => {
          dispatch({
            type: 'append-char',
            char: TYPEWRITER_QUERY[nextIdx],
          });
        }, TYPEWRITER_CHAR_INTERVAL);
        return () => clearTimeout(t);
      }
      // All chars typed — wait for remainder of typing phase then advance.
      const typedMs = TYPEWRITER_QUERY.length * TYPEWRITER_CHAR_INTERVAL;
      const remaining = Math.max(200, PHASE_TYPING_DURATION - typedMs);
      const t = setTimeout(() => dispatch({ type: 'show-entity' }), remaining);
      return () => clearTimeout(t);
    }

    if (state.phase === 'entity') {
      const t = setTimeout(
        () => dispatch({ type: 'reset' }),
        PHASE_ENTITY_DURATION
      );
      return () => clearTimeout(t);
    }
  }, [prefersReducedMotion, state.phase, state.typedText, state.isPaused]);

  // ── User-controlled pause / resume (via ref + addEventListener) ──────
  // Using addEventListener instead of JSX handlers to keep the section
  // element free of interactive attributes (Biome a11y).

  useEffect(() => {
    const el = containerRef.current;
    const pauseControl = pauseControlRef.current;
    if ((!el && !pauseControl) || prefersReducedMotion) return;

    const clearResumeTimer = () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };

    const pauseDemo = () => {
      clearResumeTimer();
      dispatch({ type: 'pause' });
    };

    const scheduleResume = () => {
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        dispatch({ type: 'resume' });
        resumeTimerRef.current = null;
      }, RESUME_DELAY_AFTER_HOVER);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) pauseDemo();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      scheduleResume();
    };

    el?.addEventListener('mouseenter', pauseDemo);
    el?.addEventListener('mouseleave', scheduleResume);
    el?.addEventListener('touchstart', pauseDemo);
    el?.addEventListener('touchend', scheduleResume);
    el?.addEventListener('touchcancel', scheduleResume);
    pauseControl?.addEventListener('focus', pauseDemo);
    pauseControl?.addEventListener('blur', scheduleResume);
    pauseControl?.addEventListener('keydown', onKeyDown);
    pauseControl?.addEventListener('keyup', onKeyUp);
    return () => {
      el?.removeEventListener('mouseenter', pauseDemo);
      el?.removeEventListener('mouseleave', scheduleResume);
      el?.removeEventListener('touchstart', pauseDemo);
      el?.removeEventListener('touchend', scheduleResume);
      el?.removeEventListener('touchcancel', scheduleResume);
      pauseControl?.removeEventListener('focus', pauseDemo);
      pauseControl?.removeEventListener('blur', scheduleResume);
      pauseControl?.removeEventListener('keydown', onKeyDown);
      pauseControl?.removeEventListener('keyup', onKeyUp);
      clearResumeTimer();
    };
  }, [prefersReducedMotion]);

  // ── Derived geometry ───────────────────────────────────────────────────

  const mode: SurfaceMode = state.phase;
  const geometry = geometryFor(mode);
  const isEntity = state.phase === 'entity';
  const dockClass = 'flex justify-center';

  const activeRelease = DEMO_RELEASES[0];

  return (
    <section
      ref={containerRef}
      aria-label='Jovie AI Composer Demo'
      className='relative w-full'
    >
      <button
        ref={pauseControlRef}
        type='button'
        aria-label={
          state.isPaused
            ? 'Resume Jovie composer demo'
            : 'Pause Jovie composer demo'
        }
        aria-pressed={state.isPaused}
        className='pointer-events-none absolute left-4 top-4 z-[2] flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/35'
      >
        {state.isPaused ? (
          <Play size={14} strokeWidth={1.8} aria-hidden='true' />
        ) : (
          <Pause size={14} strokeWidth={1.8} aria-hidden='true' />
        )}
      </button>

      {/* Giant 'j' ornament — behind everything */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 flex items-center justify-center select-none overflow-hidden'
      >
        <span
          style={{
            fontFamily:
              'var(--font-display, "Satoshi", -apple-system, system-ui, sans-serif)',
            fontWeight: 600,
            fontSize: 'clamp(180px, 38vw, 360px)',
            color: 'rgba(255,255,255,0.018)',
            letterSpacing: '-0.08em',
            lineHeight: 0.8,
            transform: 'translateY(-12px)',
            userSelect: 'none',
          }}
        >
          j
        </span>
      </div>

      {/* Docking container — centers or right-anchors based on mode */}
      <div className={cn(dockClass, 'relative z-[1] w-full px-4 py-12')}>
        <motion.div
          data-surface-mode={mode}
          animate={
            prefersReducedMotion
              ? undefined
              : {
                  borderRadius: geometry.borderRadius,
                }
          }
          transition={prefersReducedMotion ? undefined : TRANSITION_SURFACE}
          style={{
            background: SURFACE_BG,
            borderRadius: geometry.borderRadius,
            width: 'min(100%, 760px)',
          }}
          className={cn(
            'home-composer-surface',
            'overflow-hidden border border-white/[0.07]',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_0_rgba(0,0,0,0.18),0_8px_24px_-8px_rgba(0,0,0,0.3)]',
            isEntity ? 'flex' : 'flex flex-col'
          )}
        >
          {isEntity ? (
            // ── Entity state: two-column layout ───────────────────────
            <div className='home-composer-result flex w-full'>
              {/* Left rail: 264px */}
              <aside className='home-composer-result__rail flex w-66 shrink-0 flex-col border-r border-white/[0.055]'>
                <div className='px-3 pt-3 pb-2'>
                  <EntityPill label='Releases' />
                </div>
                <TabBar activeTab='Releases' />
                <div className='flex-1 overflow-y-auto py-1'>
                  {DEMO_RELEASES.map(release => (
                    <ReleaseRow
                      key={release.id}
                      label={release.label}
                      type={release.type}
                      year={release.year}
                      artBg={release.artBg}
                      isActive={release.id === 'deep-end'}
                    />
                  ))}
                </div>
              </aside>

              {/* Right column: preview pane + input */}
              <div className='flex min-w-0 flex-1 flex-col'>
                <PreviewPane
                  artBg={activeRelease.artBg}
                  eyebrow='Release · Single'
                  title='The Deep End'
                  stats={MIDNIGHT_RUN_STATS}
                />
                <ActionList />
                <div className='border-t border-white/[0.055]'>
                  <InputRow value={state.typedText} />
                </div>
              </div>
            </div>
          ) : (
            // ── Empty / typing states ──────────────────────────────────
            <InputRow
              value={state.typedText}
              placeholder='Ask Jovie for a release plan'
            />
          )}
        </motion.div>
      </div>
    </section>
  );
}
