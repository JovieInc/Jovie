'use client';

import { type FeatureBundle, LazyMotion } from 'motion/react';
import { createContext, type ReactNode, useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export const ColumnSnapReducedMotionContext = createContext(false);

function createFeatureGate() {
  let release!: (features: FeatureBundle) => void;
  const promise = new Promise<FeatureBundle>(resolve => {
    release = resolve;
  });
  return { load: () => promise, release };
}

/** Keep the layout engine out of initial table JS and static admin tables. */
export function ColumnSnapMotion({
  enabled,
  children,
}: {
  readonly enabled: boolean;
  readonly children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [gate] = useState(createFeatureGate);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled || reducedMotion || loaded) return;
    let active = true;
    import('./column-snap-features')
      .then(module => {
        if (active) {
          gate.release(module.default);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) console.warn('Column snap motion features could not load');
      });
    return () => {
      active = false;
    };
  }, [enabled, reducedMotion, loaded, gate]);

  // Keep one provider and child identity while features arrive or preferences
  // change. LazyMotion's asynchronous loader only runs on its initial mount.
  return (
    <ColumnSnapReducedMotionContext.Provider value={reducedMotion}>
      <LazyMotion features={gate.load}>{children}</LazyMotion>
    </ColumnSnapReducedMotionContext.Provider>
  );
}
