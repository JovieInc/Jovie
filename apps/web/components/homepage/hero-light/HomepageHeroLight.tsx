'use client';

import { useEffect, useRef, useState } from 'react';
import {
  HERO_LIGHT_PERF,
  type HomepageHeroLightRenderer,
  isLowPowerBattery,
  shouldRunHeroLightWebGL,
} from './hero-light-gate';
import './HomepageHeroLight.css';

interface HeroLightHandle {
  stop(): void;
}

export interface HomepageHeroLightProps {
  /** `css` is the invariant-safe poster. `webgl` may upgrade it after idle. */
  readonly renderer: HomepageHeroLightRenderer;
}

/**
 * Decorative hero light. No text, no controls. Pointer events stay on the
 * hero. The WebGL canvas is mounted only after a client capability check, so
 * reduced-motion, save-data, and low-power sessions keep the CSS poster and
 * never create a canvas.
 */
export function HomepageHeroLight({ renderer }: HomepageHeroLightProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mountCanvas, setMountCanvas] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (renderer !== 'webgl' || !shouldRunHeroLightWebGL()) return;
    setMountCanvas(true);
  }, [renderer]);

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
    reducedMotion.addEventListener('change', onMotion);

    return () => {
      cancelled = true;
      if (usesIdleCallback) globalThis.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      reducedMotion.removeEventListener('change', onMotion);
      handle?.stop();
    };
  }, [mountCanvas]);

  return (
    <div
      aria-hidden='true'
      className='homepage-hero-light'
      data-live={live ? 'true' : 'false'}
      data-renderer={renderer}
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
