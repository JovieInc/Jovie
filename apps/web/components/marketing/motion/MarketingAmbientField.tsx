'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AmbientFieldHandle } from './ambient-field-gl';
import './MarketingAmbientField.css';

/** Accent rotation order (accent-rotation rule, 2026-09-26). */
export const MARKETING_AMBIENT_ACCENTS = [
  'blue',
  'purple',
  'pink',
  'orange',
  'green',
  'red',
] as const;

export type MarketingAmbientAccent = (typeof MARKETING_AMBIENT_ACCENTS)[number];

export interface MarketingAmbientFieldProps {
  /** The section's one accent. Neighbouring sections must not share it. */
  readonly accent: MarketingAmbientAccent;
  readonly className?: string;
}

interface WindowHints {
  readonly WebGL2RenderingContext?: unknown;
}

interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly connection?: { readonly saveData?: boolean };
}

/**
 * The GL layer only runs where it is cheap and wanted: motion allowed, no
 * data saver, and a device that is not obviously low-end. Everyone else
 * keeps the SSR poster, which is the same composition held still.
 */
export function shouldRunAmbientField(
  win: Window = globalThis.window
): boolean {
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const nav = win.navigator as Navigator & NavigatorHints;
  if (nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) < 4) return false;
  if ((nav.hardwareConcurrency ?? 8) < 4) return false;
  return (
    typeof (win as Window & WindowHints).WebGL2RenderingContext === 'function'
  );
}

function readRgb(
  probe: CanvasRenderingContext2D,
  cssColor: string
): [number, number, number] | null {
  if (!cssColor) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = cssColor;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

/**
 * Ambient hero field (JOV-7757): one accent, one soft focal bloom, slow
 * drift. Server-renders a CSS poster; on capable devices a ~2 KB WebGL2
 * layer loads after idle and cross-fades in over it. Decorative only.
 */
export function MarketingAmbientField({
  accent,
  className,
}: MarketingAmbientFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || !shouldRunAmbientField()) return;

    let handle: AmbientFieldHandle | null = null;
    let cancelled = false;
    const reducedMotion = globalThis.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );

    const stop = () => {
      handle?.stop();
      handle = null;
      setLive(false);
    };

    const start = () => {
      void import('./ambient-field-gl').then(({ startAmbientField }) => {
        if (cancelled) return;
        const probe = document
          .createElement('canvas')
          .getContext('2d', { willReadFrequently: true });
        if (!probe) return;
        const styles = getComputedStyle(root);
        const accentRgb = readRgb(
          probe,
          styles.getPropertyValue('--ambient-accent').trim()
        );
        const baseRgb = readRgb(probe, styles.backgroundColor);
        if (!accentRgb || !baseRgb) return;
        handle = startAmbientField(
          canvas,
          { accent: accentRgb, base: baseRgb },
          () => setLive(true)
        );
      });
    };

    const usesIdleCallback = 'requestIdleCallback' in globalThis;
    const idleId = usesIdleCallback
      ? globalThis.requestIdleCallback(start, { timeout: 2000 })
      : 0;
    const timeoutId = usesIdleCallback
      ? null
      : globalThis.setTimeout(start, 600);

    reducedMotion.addEventListener('change', stop);

    return () => {
      cancelled = true;
      if (usesIdleCallback) globalThis.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      reducedMotion.removeEventListener('change', stop);
      handle?.stop();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden='true'
      className={cn('marketing-ambient-field', className)}
      data-accent={accent}
      data-live={live ? 'true' : 'false'}
      data-testid='marketing-ambient-field'
    >
      <canvas ref={canvasRef} className='marketing-ambient-field__canvas' />
    </div>
  );
}
