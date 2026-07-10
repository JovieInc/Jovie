import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellRightRail } from '../AppShellRightRail';

describe('AppShellRightRail', () => {
  it('renders children inside the sticky context panel landmark', () => {
    render(
      <AppShellRightRail>
        <div data-testid='fixture-panel'>Panel body</div>
      </AppShellRightRail>
    );

    const rail = screen.getByTestId('app-shell-right-rail');

    expect(rail).toHaveAttribute('aria-label', 'Context Panel');
    expect(rail).toHaveClass(
      'sticky',
      'top-0',
      'overflow-hidden',
      'duration-cinematic',
      'ease-cinematic'
    );
    expect(rail).toContainElement(screen.getByTestId('fixture-panel'));
  });

  it('applies shellChatV1 radius treatment when opted in', () => {
    render(
      <AppShellRightRail variant='shellChatV1'>
        <div>Panel</div>
      </AppShellRightRail>
    );

    const rail = screen.getByTestId('app-shell-right-rail');

    expect(rail).toHaveAttribute('data-shell-design', 'shellChatV1');
    expect(rail).toHaveClass('lg:rounded-(--linear-app-shell-radius)');
  });

  it('defaults to legacy variant without shell radius chrome', () => {
    render(
      <AppShellRightRail>
        <div>Panel</div>
      </AppShellRightRail>
    );

    const rail = screen.getByTestId('app-shell-right-rail');

    expect(rail).toHaveAttribute('data-shell-design', 'legacy');
    expect(rail).not.toHaveClass('lg:rounded-(--linear-app-shell-radius)');
  });

  it('merges custom className without replacing base sticky layout', () => {
    render(
      <AppShellRightRail className='fixture-rail'>
        <div>Panel</div>
      </AppShellRightRail>
    );

    const rail = screen.getByTestId('app-shell-right-rail');

    expect(rail).toHaveClass('fixture-rail', 'sticky', 'top-0');
  });
});
