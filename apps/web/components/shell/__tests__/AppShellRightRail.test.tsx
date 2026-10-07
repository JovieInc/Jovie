import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellRightRail } from '../AppShellRightRail';

describe('AppShellRightRail', () => {
  it('contains the inspector in an overlay without allocating a desktop column', () => {
    render(
      <AppShellRightRail className='fixture-rail'>
        <div data-testid='fixture-panel'>Panel body</div>
      </AppShellRightRail>
    );
    const rail = screen.getByTestId('app-shell-right-rail');
    expect(rail).toHaveAttribute('aria-label', 'Context Panel');
    expect(rail).toHaveClass(
      'shell-inspector-overlay',
      'pointer-events-none',
      'fixture-rail'
    );
    expect(rail).not.toHaveClass('lg:sticky', 'shrink-0', 'relative', 'h-0');
    expect(rail).toContainElement(screen.getByTestId('fixture-panel'));
    expect(screen.getByTestId('fixture-panel').parentElement).toHaveClass(
      'pointer-events-auto'
    );
  });
  it('retains shared motion and the inset without clipping the viewport mobile adapter', () => {
    render(
      <AppShellRightRail>
        <div>Panel</div>
      </AppShellRightRail>
    );
    expect(screen.getByTestId('app-shell-right-rail')).toHaveClass(
      'shell-inspector-overlay',
      'transition-shell-rail-allocation',
      'motion-reduce:transition-none'
    );
  });
});
