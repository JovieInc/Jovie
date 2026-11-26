'use client';

import { type FeatureBundle, LazyMotion } from 'motion/react';
import type { ReactNode } from 'react';

const loadDomAnimation = (): Promise<FeatureBundle> =>
  import('./dom-animation-features').then(module => module.default);

const loadDomMax = (): Promise<FeatureBundle> =>
  import('./dom-max-features').then(module => module.default);

/**
 * Wrap `m.*` components so the motion engine loads after first paint.
 *
 * `motion.*` pulls the whole animation engine (about 64 KB gzipped) into the
 * initial bundle of every route that renders it. `m.*` under this provider
 * renders the same markup with its `initial` styles straight away, then
 * animates once the features arrive. Use `LazyDomMaxMotion` when a component
 * needs drag or layout animation.
 */
export function LazyDomAnimationMotion({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <LazyMotion features={loadDomAnimation}>{children}</LazyMotion>;
}

export function LazyDomMaxMotion({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <LazyMotion features={loadDomMax}>{children}</LazyMotion>;
}
