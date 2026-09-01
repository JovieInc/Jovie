import { render, screen, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HomeComposerHero } from './HomeComposerHero';

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      animate?: unknown;
      transition?: unknown;
      children?: ReactNode;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

describe('HomeComposerHero', () => {
  it('renders the stable entity-state composer demo', () => {
    render(<HomeComposerHero />);

    const region = screen.getByRole('region', {
      name: 'Jovie AI Composer Demo',
    });
    const pauseControl = screen.getByRole('button', {
      name: 'Pause Jovie composer demo',
    });
    const surface = region.querySelector('.home-composer-surface');

    expect(pauseControl).toHaveAttribute('aria-pressed', 'false');
    expect(surface).toHaveAttribute('data-surface-mode', 'entity');
    expect(surface).toHaveClass(
      'home-composer-surface',
      'overflow-hidden',
      'border',
      'shadow-none',
      'flex'
    );
    expect(within(region).getByText('The Deep End')).toBeInTheDocument();
    expect(within(region).getByText('Fan path')).toBeInTheDocument();
    expect(within(region).getByText('Ready')).toBeInTheDocument();
  });
});
