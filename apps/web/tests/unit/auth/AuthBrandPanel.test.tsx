import { act, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    p: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
  },
}));

vi.mock('@/components/marketing/ProductScreenshotFrame', () => ({
  ProductScreenshotFrame: ({ scenarioId }: { scenarioId: string }) => (
    <div data-testid='product-screenshot-frame'>{scenarioId}</div>
  ),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

import { AuthBrandPanel } from '@/features/auth/AuthBrandPanel';

describe('AuthBrandPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a stable headline with slide-specific description copy', () => {
    render(<AuthBrandPanel />);

    expect(screen.getByText('Built for Artists.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Plan releases, links, and launch work from one calm artist workspace.'
      )
    ).toBeInTheDocument();
  });

  it('rotates the description with the active showcase slide', async () => {
    render(<AuthBrandPanel />);

    await act(async () => {
      vi.advanceTimersByTime(5500);
    });

    expect(
      screen.getByText(
        'See every listener, buyer, and contact without leaving the flow.'
      )
    ).toBeInTheDocument();
  });
});
