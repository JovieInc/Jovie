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
    expect(rail).toHaveAttribute('data-shell-rail-motion', 'right');
    expect(rail).toHaveClass(
      'sticky',
      'top-0',
      'z-30',
      'lg:z-10',
      'w-0',
      'lg:w-fit',
      'h-full',
      'min-h-0',
      'self-stretch',
      'overflow-hidden',
      'lg:p-1.5',
      'duration-cinematic',
      'ease-cinematic'
    );
    expect(rail).toHaveClass('transition-[flex-basis,width,opacity,transform]');
    expect(rail).not.toHaveClass('self-start');
    expect(rail).not.toHaveClass('z-10');
    expect(rail).toContainElement(screen.getByTestId('fixture-panel'));
  });

  it('applies the canonical inset rail treatment', () => {
    render(
      <AppShellRightRail>
        <div>Panel</div>
      </AppShellRightRail>
    );

    const rail = screen.getByTestId('app-shell-right-rail');

    expect(rail).toHaveClass(
      'lg:rounded-(--linear-app-shell-radius)',
      'lg:p-1.5'
    );
  });

  it('has no desktop overlay positioning and only allocates the width of its drawer child', () => {
    render(
      <AppShellRightRail>
        <div>Panel</div>
      </AppShellRightRail>
    );

    const rail = screen.getByTestId('app-shell-right-rail');

    expect(rail).toHaveClass('lg:w-fit', 'shrink-0');
    expect(rail).not.toHaveClass(
      'fixed',
      'absolute',
      'lg:fixed',
      'lg:absolute'
    );
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
