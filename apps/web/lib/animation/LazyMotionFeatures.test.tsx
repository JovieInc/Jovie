import { render, screen } from '@testing-library/react';
import type { FeatureBundle } from 'motion/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyDomAnimationMotion, LazyDomMaxMotion } from './LazyMotionFeatures';

const state = vi.hoisted(() => ({
  loaders: [] as (() => Promise<FeatureBundle>)[],
}));

vi.mock('motion/react', () => ({
  LazyMotion: ({
    children,
    features,
  }: {
    children: ReactNode;
    features: () => Promise<FeatureBundle>;
  }) => {
    state.loaders.push(features);
    return children;
  },
}));

vi.mock('./dom-animation-features', () => ({
  default: { name: 'domAnimation' },
}));
vi.mock('./dom-max-features', () => ({ default: { name: 'domMax' } }));

describe('LazyMotionFeatures', () => {
  beforeEach(() => {
    state.loaders = [];
  });

  it('renders children before any feature bundle loads', () => {
    render(
      <LazyDomAnimationMotion>
        <span>Ready</span>
      </LazyDomAnimationMotion>
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('hands LazyMotion a loader for the animation features', async () => {
    render(
      <LazyDomAnimationMotion>
        <span>Swap</span>
      </LazyDomAnimationMotion>
    );
    expect(state.loaders).toHaveLength(1);
    await expect(state.loaders[0]?.()).resolves.toEqual({
      name: 'domAnimation',
    });
  });

  it('hands LazyMotion a loader for drag and layout features', async () => {
    render(
      <LazyDomMaxMotion>
        <span>Card</span>
      </LazyDomMaxMotion>
    );
    await expect(state.loaders[0]?.()).resolves.toEqual({ name: 'domMax' });
  });
});
