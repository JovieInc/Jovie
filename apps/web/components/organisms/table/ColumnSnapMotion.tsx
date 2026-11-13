'use client';

import { type FeatureBundle, LazyMotion } from 'motion/react';
import {
  createContext,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export const ColumnSnapReducedMotionContext = createContext(false);
export const ColumnSnapLayoutDependencyContext = createContext('');

function subscribeToViewportResize(onResize: () => void) {
  globalThis.addEventListener('resize', onResize);
  return () => globalThis.removeEventListener('resize', onResize);
}

function viewportSize() {
  return `${globalThis.innerWidth}:${globalThis.innerHeight}`;
}

const serverViewportSize = () => '';

interface ColumnSizeDefinition {
  readonly size?: number;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly columns?: readonly ColumnSizeDefinition[];
}

function readColumnSizes(
  columns: readonly ColumnSizeDefinition[]
): (number | undefined)[][] {
  return columns.flatMap(column =>
    column.columns
      ? readColumnSizes(column.columns)
      : [[column.size, column.minSize, column.maxSize]]
  );
}

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
  columns = [],
  children,
}: {
  readonly enabled: boolean;
  readonly columns?: readonly ColumnSizeDefinition[];
  readonly children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  // Renderers often close over selection. Compare schema widths, not column
  // object identity, so drawer allocation and row changes cannot start a snap.
  const columnSizeKey = JSON.stringify(readColumnSizes(columns));
  const viewport = useSyncExternalStore(
    subscribeToViewportResize,
    viewportSize,
    serverViewportSize
  );
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
      <ColumnSnapLayoutDependencyContext.Provider
        value={`${viewport}|${columnSizeKey}`}
      >
        <LazyMotion features={gate.load}>{children}</LazyMotion>
      </ColumnSnapLayoutDependencyContext.Provider>
    </ColumnSnapReducedMotionContext.Provider>
  );
}
