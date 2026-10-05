'use client';

import type { ReactNode } from 'react';
import { useAudioChromeSnapshot } from '@/components/organisms/audio-chrome-state';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

/**
 * ShellAudioDock — the shell-level dock row that hosts the full audio player
 * below the rounded main panel (JOV-6680).
 *
 * Visibility is driven entirely by `audio-chrome-state`: when
 * `fullPlayerVisible` flips true the dock's height animates 0 → player height
 * and the main panel's bottom edge slides up in lockstep (the dock is an
 * in-flow sibling below `<main>`); when it flips false the panel slides back
 * down and the player is gone. Idle/stopped playback reports
 * `fullPlayerVisible: false`, so dismissing or stopping playback collapses
 * the dock. The sidebar mini card keeps full/mini exclusivity (JOV-3511).
 *
 * Motion tiers: reveal is cinematic (`--ds-motion-cinematic-*`), hide is the
 * standard tier (`--duration-normal` + subtle easing). Under
 * `prefers-reduced-motion` both resolve instantly.
 *
 * Only height animates — no horizontal shift, no content reflow inside the
 * main panel.
 */
export function ShellAudioDock({
  children,
  className,
  visible,
  testId = 'shell-audio-dock',
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** Override chrome visibility for a dock portaled into the media dialog. */
  readonly visible?: boolean;
  readonly testId?: string;
}) {
  const { fullPlayerVisible } = useAudioChromeSnapshot();
  const prefersReducedMotion = useReducedMotion();
  const open = visible ?? fullPlayerVisible;

  // Reveal: cinematic tier (~420ms, ease-out-expo). Hide: standard tier
  // (--duration-normal ≈ 160ms, subtle easing).
  const duration = open
    ? 'var(--ds-motion-cinematic-duration)'
    : 'var(--duration-normal)';
  const easing = open
    ? 'var(--ds-motion-cinematic-easing)'
    : 'var(--ds-motion-subtle-easing)';

  return (
    <div
      data-testid={testId}
      data-shell-audio-dock='true'
      data-shell-rail-motion='dock'
      data-state={open ? 'open' : 'closed'}
      aria-hidden={!open}
      inert={!open || undefined}
      className={cn(
        // Shell-elevation surface: same plane + radius tokens as the main
        // panel so the panel's bottom corners round against the dock.
        'shrink-0 overflow-hidden bg-(--app-shell-content-surface)',
        'lg:rounded-(--app-shell-radius) lg:shadow-(--app-shell-shadow)',
        className
      )}
      style={{
        maxHeight: open ? 'var(--app-shell-audio-bar-max-height)' : 0,
        marginTop: open ? 'var(--app-shell-gap)' : 0,
        transition: prefersReducedMotion
          ? 'none'
          : `max-height ${duration} ${easing}, margin-top ${duration} ${easing}`,
      }}
    >
      <div
        data-testid='shell-audio-dock-content'
        style={{
          opacity: open ? 1 : 0,
          transform:
            prefersReducedMotion || open ? 'translateY(0)' : 'translateY(12px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: prefersReducedMotion
            ? 'none'
            : 'opacity var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing), transform var(--ds-motion-cinematic-duration) var(--ds-motion-cinematic-easing)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
