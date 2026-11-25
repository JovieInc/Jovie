import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TransitionPanel } from './transition-panel';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      ...props
    }: {
      readonly children?: React.ReactNode;
      readonly [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

describe('TransitionPanel', () => {
  it('renders the active child and keeps a static reduced-motion fallback', async () => {
    const { container, rerender } = render(
      <TransitionPanel activeIndex={0} data-testid='panel'>
        {['Find You', 'Claim Your Name', 'Go Live']}
      </TransitionPanel>
    );

    expect(screen.getByTestId('panel')).toHaveTextContent('Find You');
    rerender(
      <TransitionPanel activeIndex={2} data-testid='panel'>
        {['Find You', 'Claim Your Name', 'Go Live']}
      </TransitionPanel>
    );
    expect(screen.getByTestId('panel')).toHaveTextContent('Go Live');
    await expectNoA11yViolations(container);
  });
});
