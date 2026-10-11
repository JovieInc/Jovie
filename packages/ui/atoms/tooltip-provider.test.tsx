import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from './tooltip';

vi.mock('@radix-ui/react-tooltip', async importOriginal => ({
  ...(await importOriginal<typeof import('@radix-ui/react-tooltip')>()),
  Provider: ({
    children,
    delayDuration,
    skipDelayDuration,
  }: {
    children: ReactNode;
    delayDuration?: number;
    skipDelayDuration?: number;
  }) => (
    <div
      data-testid='timing-scope'
      data-delay={delayDuration}
      data-skip={skipDelayDuration}
    >
      {children}
    </div>
  ),
}));

describe('tooltip warm-up ownership', () => {
  it('shares one canonical timing scope across default wrappers', () => {
    render(
      <TooltipProvider>
        <TooltipProvider>
          <button type='button'>First</button>
        </TooltipProvider>
        <TooltipProvider>
          <button type='button'>Second</button>
        </TooltipProvider>
      </TooltipProvider>
    );
    expect(screen.getAllByTestId('timing-scope')).toHaveLength(1);
    expect(screen.getByTestId('timing-scope')).toHaveAttribute(
      'data-delay',
      '300'
    );
    expect(screen.getByTestId('timing-scope')).toHaveAttribute(
      'data-skip',
      '300'
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
  it.each([
    { delayDuration: 0 },
    { skipDelayDuration: 0 },
    { disableHoverableContent: true },
  ])('preserves an explicit isolated override %j', props => {
    render(
      <TooltipProvider>
        <TooltipProvider {...props}>Notice</TooltipProvider>
      </TooltipProvider>
    );
    const scopes = screen.getAllByTestId('timing-scope');
    expect(scopes).toHaveLength(2);
    expect(scopes[1]).toHaveAttribute(
      'data-delay',
      String('delayDuration' in props ? props.delayDuration : 300)
    );
    expect(scopes[1]).toHaveAttribute(
      'data-skip',
      String('skipDelayDuration' in props ? props.skipDelayDuration : 300)
    );
  });
});
