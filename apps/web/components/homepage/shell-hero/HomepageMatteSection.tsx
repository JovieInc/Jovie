'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { MatteFieldHandle } from '@/components/marketing/motion/matte-field-gl';
import { cn } from '@/lib/utils';

interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly connection?: { readonly saveData?: boolean };
}

/**
 * The GL field runs only where it is cheap and wanted: motion allowed, no
 * data saver, a device that is not obviously low-end, WebGL2 present.
 * Everyone else keeps the static CSS poster, which is the designed rest state.
 */
function shouldRunMatteField(): boolean {
  if (globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  const nav = globalThis.navigator as Navigator & NavigatorHints;
  if (nav.connection?.saveData) return false;
  if ((nav.deviceMemory ?? 8) < 4) return false;
  if ((nav.hardwareConcurrency ?? 8) < 4) return false;
  return typeof globalThis.WebGL2RenderingContext === 'function';
}

/**
 * Matte field behind the sections below the hero (never under the hero:
 * one moving idea per frame). Server-renders the poster; the WebGL2 layer
 * loads after idle and cross-fades in over it. Decorative only.
 */
export function HomepageMatteSection({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shouldRunMatteField()) return;

    let handle: MatteFieldHandle | null = null;
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
      void import('@/components/marketing/motion/matte-field-gl').then(
        ({ startMatteField }) => {
          if (cancelled) return;
          handle = startMatteField(canvas, {}, () => setLive(true));
        }
      );
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
      className={cn('shell-matte', className)}
      data-live={live ? 'true' : 'false'}
      data-testid='homepage-matte-section'
    >
      <div aria-hidden='true' className='shell-matte__field'>
        <canvas ref={canvasRef} className='shell-matte__canvas' />
      </div>
      <div className='shell-matte__content'>{children}</div>
    </div>
  );
}
