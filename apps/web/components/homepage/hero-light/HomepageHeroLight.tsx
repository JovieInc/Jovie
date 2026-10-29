'use client';

// NIGHT_DJ_HARMONY_V1: scoped WebGL exception — this hero's decorative layer
// only. See docs/design/night-dj-harmony-v1.md and the exception record in
// docs/performance/performance-invariants-v1.md.
import { useEffect, useRef, useState } from 'react';
import { isAnimatedBackgroundEnabled } from '@/data/marketing/animatedBackgroundBudget';
import {
  HERO_LIGHT_PERF,
  isLowPowerBattery,
  shouldRunHeroLightWebGL,
} from './hero-light-gate';
import './HomepageHeroLight.css';

interface HeroLightHandle {
  stop(): void;
}

/**
 * Decorative hero light. No text, no controls. Pointer events stay on the
 * hero. The static CSS poster is the default and the layout (Tim,
 * 2026-10-29: matte, static marketing heroes). The WebGL path runs only when
 * the `homepage-hero-light` entry in the animated-background budget
 * (`data/marketing/animatedBackgroundBudget.ts`) enables it. Even then a
 * canvas is created only after a client capability check, and it crossfades
 * in. Reduced motion (`prefers-reduced-motion`), save-data, low-power,
 * missing WebGL, a refused context, and context loss leave the static poster
 * in place.
 */
export interface HomepageHeroLightProps {
  /** Overrides the registered budget's default. Static unless enabled. */
  readonly animate?: boolean;
}

export function HomepageHeroLight({
  animate = isAnimatedBackgroundEnabled('homepage-hero-light'),
}: HomepageHeroLightProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mountCanvas, setMountCanvas] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!animate) return;
    if (!shouldRunHeroLightWebGL()) return;
    setMountCanvas(true);
  }, [animate]);

  useEffect(() => {
    if (!mountCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let handle: HeroLightHandle | null = null;
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
      void (async () => {
        if (cancelled || reducedMotion.matches) return;
        if (await isLowPowerBattery()) return;
        if (cancelled) return;
        const { startHeroLight } = await import('./hero-light-gl');
        if (cancelled) return;
        handle = startHeroLight(
          canvas,
          () => setLive(true),
          () => {
            stop();
          }
        );
      })();
    };

    const usesIdleCallback = 'requestIdleCallback' in globalThis;
    const idleId = usesIdleCallback
      ? globalThis.requestIdleCallback(start, {
          timeout: HERO_LIGHT_PERF.idleTimeoutMs,
        })
      : 0;
    const timeoutId = usesIdleCallback
      ? null
      : globalThis.setTimeout(start, HERO_LIGHT_PERF.idleFallbackMs);

    const onMotion = () => {
      if (reducedMotion.matches) stop();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stop();
    };
    reducedMotion.addEventListener('change', onMotion);
    canvas.addEventListener('webglcontextlost', onContextLost);

    return () => {
      cancelled = true;
      if (usesIdleCallback) globalThis.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      reducedMotion.removeEventListener('change', onMotion);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      handle?.stop();
    };
  }, [mountCanvas]);

  return (
    <div
      aria-hidden='true'
      className='homepage-hero-light'
      data-animate={animate ? 'true' : 'false'}
      data-live={live ? 'true' : 'false'}
      data-renderer={live ? 'webgl' : 'css'}
      data-testid='homepage-hero-light'
    >
      <div className='homepage-hero-light__wash' />
      <div className='homepage-hero-light__grid' />
      <div className='homepage-hero-light__focus'>
        <div className='homepage-hero-light__edge' />
      </div>
      {mountCanvas ? (
        <canvas ref={canvasRef} className='homepage-hero-light__canvas' />
      ) : null}
    </div>
  );
}
