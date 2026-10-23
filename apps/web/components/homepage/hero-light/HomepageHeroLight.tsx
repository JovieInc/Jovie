'use client';

// NIGHT_DJ_HARMONY_V1: scoped WebGL exception — this hero's decorative layer
// only. See docs/design/night-dj-harmony-v1.md and the exception record in
// docs/performance/performance-invariants-v1.md.
import { useEffect, useRef, useState } from 'react';
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
 * hero. The CSS poster is always the layout. A canvas is created only after
 * a client capability check, and it crossfades in. Reduced motion, save-data,
 * low-power, missing WebGL, a refused context, and context loss leave the
 * poster in place.
 */
export function HomepageHeroLight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mountCanvas, setMountCanvas] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!shouldRunHeroLightWebGL()) return;
    setMountCanvas(true);
  }, []);

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
