import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';

describe('AppShellFrame right rail', () => {
  it('mounts the right rail as a column beside the route so it pushes content', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        rightPanel={<div data-testid='fixture-right-rail'>Right rail</div>}
      />
    );

    const scrollPane = screen.getByTestId('app-shell-scroll');
    const rightRail = screen.getByTestId('app-shell-right-rail');

    expect(scrollPane).toHaveClass('overflow-hidden');
    expect(scrollPane).not.toHaveClass('overflow-y-auto');
    expect(scrollPane).toContainElement(screen.getByText('Main Content'));
    const main = screen.getByRole('main');
    const mainPlane = rightRail.closest('[data-app-shell-main-plane]');
    const mainColumn = main.parentElement;

    // Founder call (2026-11-08): the rail pushes content, never lays on top
    // of it. It is the main plane's second flex column, a sibling of the
    // route column, and never a descendant of the route surface.
    expect(mainPlane).toHaveAttribute('data-app-shell-main-plane', 'true');
    expect(mainPlane).toHaveClass('flex', 'overflow-clip');
    expect(mainColumn).toHaveAttribute('data-app-shell-main-column', 'true');
    expect(mainColumn).toHaveClass('flex-1', 'min-w-0');
    expect(rightRail.parentElement).toBe(mainPlane);
    expect(mainColumn?.nextElementSibling).toBe(rightRail);
    expect(main).not.toContainElement(rightRail);
    expect(scrollPane).not.toContainElement(rightRail);
    expect(rightRail).toContainElement(
      screen.getByTestId('fixture-right-rail')
    );
    expect(rightRail).toHaveClass('shell-inspector-rail');
    expect(rightRail).not.toHaveClass('shell-inspector-overlay');
    // The drawer caps its width against the main plane container.
    expect(mainPlane).toHaveClass('lg:shell-inspector-host');
    expect(main.querySelector('[data-app-shell-main-content]')).not.toHaveClass(
      'lg:shell-inspector-host'
    );
    expect(rightRail).toHaveAttribute('data-rail-below-header', 'true');
    expect(mainPlane).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-cinematic',
      'motion-reduce:transition-none'
    );
  });

  it('lets a headerless route float a preview from the plane top', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        main={<div>Main Content</div>}
        rightPanel={<div>Right rail</div>}
      />
    );

    expect(screen.getByTestId('app-shell-right-rail')).not.toHaveAttribute(
      'data-rail-below-header'
    );
  });

  it('keeps intrinsic route sizing when no right rail exists', () => {
    // A size container drops intrinsic width; only rail shells opt in.
    const { container } = render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        main={<div>Main Content</div>}
      />
    );
    expect(screen.queryByTestId('app-shell-right-rail')).toBeNull();
    expect(
      container.querySelector('[data-app-shell-main-plane]')
    ).not.toHaveClass('lg:shell-inspector-host');
  });

  it('keeps the audio dock in the route column while the rail spans the plane beside it', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        rightPanel={<div data-testid='fixture-rail'>Rail</div>}
        audioPlayer={<div data-testid='audio-player'>Player</div>}
      />
    );

    const main = screen.getByRole('main');
    const rail = screen.getByTestId('app-shell-right-rail');
    const tray = screen.getByTestId('app-shell-audio-tray');

    expect(main).not.toContainElement(rail);
    expect(rail).not.toContainElement(tray);
    expect(tray.parentElement).toHaveAttribute(
      'data-app-shell-main-column',
      'true'
    );
    expect(rail.parentElement).toHaveAttribute(
      'data-app-shell-main-plane',
      'true'
    );
    expect(rail.previousElementSibling).toBe(tray.parentElement);
  });
});
