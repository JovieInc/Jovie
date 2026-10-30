'use client';

import type { ReactNode } from 'react';
import { useAudioChromeSnapshot } from '@/components/organisms/audio-chrome-state';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

/**
 * ShellAudioDock — the shell-level dock row that hosts the full audio player
 * below the rounded main panel (JOV-6680).
 *
 * JOV-9028 (founder directive 2026-10-24, supersedes the shared-card plane
 * intent): the dock is persistent shell chrome, so it lives on the shell's
 * surface-0 plane — the same tone as the sidebar chrome — flat, with no
 * card fill, radius, or shadow of its own. The rounded main panel ends
 * cleanly above the dock; the dock never renders as a second elevated card.
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
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const { fullPlayerVisible } = useAudioChromeSnapshot();
  const prefersReducedMotion = useReducedMotion();
  const open = fullPlayerVisible;

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
      data-testid='shell-audio-dock'
      data-shell-audio-dock='true'
      data-shell-rail-motion='dock'
      data-state={open ? 'open' : 'closed'}
      aria-hidden={!open}
      inert={!open || undefined}
      className={cn(
        // Surface-0 shell plane: the dock is flat chrome next to the sidebar
        // footer, not an elevated card — the rounded main panel above owns
        // the only card elevation on this column.
        'shrink-0 overflow-hidden bg-surface-0',
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
