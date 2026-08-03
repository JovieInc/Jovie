import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';

describe('AppShellFrame', () => {
  it('renders the canonical shell design', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
      />
    );

    const mainContent = screen.getByRole('main');

    expect(mainContent).toHaveAttribute('id', 'main-content');
    expect(mainContent).not.toHaveAttribute('tabindex');
    expect(mainContent.closest('[data-app-shell-frame]')).toBeInTheDocument();
    const shellBody = mainContent.closest('[data-app-shell-body]');
    expect(shellBody).toHaveAttribute('data-shell-rail-motion', 'coordinated');
    expect(shellBody).toHaveClass(
      'transition-[gap,padding]',
      'duration-cinematic',
      'ease-cinematic',
      'motion-reduce:transition-none'
    );
    expect(mainContent).toHaveClass('lg:shadow-(--linear-app-shell-shadow)');
    expect(mainContent).toHaveClass('bg-(--app-shell-content-surface)');
    expect(mainContent).not.toHaveClass('bg-(--color-bg-surface-0)/90');
    // #main-content keeps its full rounded shell radius — no Electron override
    // strips the top corners now that the header lives inside the card.
    expect(mainContent).toHaveClass('lg:rounded-(--app-shell-radius)');
    expect(mainContent.closest('[data-app-shell-main-plane]')).not.toHaveClass(
      'lg:gap-(--app-shell-gap)'
    );
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(screen.getByText('Main Content')).toBeInTheDocument();
    // Header renders exactly once inside main (no duplicate-render hack).
    const headers = screen.getAllByText('Header');
    expect(headers).toHaveLength(1);
    expect(mainContent).toContainElement(headers[0] as HTMLElement);
  });

  it('allocates the right rail inside main beside route content instead of overlaying it', () => {
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
    const routeContent = main.querySelector('[data-app-shell-main-content]');

    expect(mainPlane).toHaveAttribute('data-app-shell-main-plane', 'true');
    expect(mainPlane).toContainElement(main);
    expect(mainPlane).toContainElement(rightRail);
    expect(main).toContainElement(rightRail);
    expect(main).toContainElement(routeContent as HTMLElement);
    expect(rightRail.parentElement).toBe(main);
    expect(routeContent?.parentElement).toBe(main);
    expect(scrollPane).not.toContainElement(rightRail);
    expect(rightRail).toContainElement(
      screen.getByTestId('fixture-right-rail')
    );
    expect(rightRail).toHaveClass('lg:sticky', 'lg:top-0');
    expect(mainPlane).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-cinematic',
      'motion-reduce:transition-none'
    );
  });

  it('reserves dev-toolbar height inside the shell scroll pane', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
      />
    );

    expect(screen.getByTestId('app-shell-scroll')).toHaveClass(
      'pb-[var(--dev-toolbar-height,0px)]'
    );
  });

  it('marks composer focus on the shell frame for chrome retreat styles', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        rightPanel={<div>Right rail</div>}
        composerFocusActive
      />
    );

    const frame = screen.getByRole('main').closest('[data-app-shell-frame]');

    expect(frame).toHaveAttribute('data-composer-focus', 'true');
    expect(screen.getByTestId('app-shell-sidebar-mount')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-right-rail')).toBeInTheDocument();
  });

  it('fills sidebar mount height so footer mt-auto can pin Settings (JOV-3960)', () => {
    render(
      <AppShellFrame
        sidebar={<aside data-testid='fixture-sidebar'>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
      />
    );

    const mount = screen.getByTestId('app-shell-sidebar-mount');
    expect(mount).toHaveClass('h-full', 'min-h-0', 'flex', 'flex-col');
    expect(mount).toHaveClass(
      'transition-[flex-basis,width,opacity,transform]',
      'duration-cinematic',
      'ease-cinematic',
      'motion-reduce:transition-none'
    );
    expect(mount).toContainElement(screen.getByTestId('fixture-sidebar'));
  });

  it('exposes one capture boundary for persistent sidebar interactions', () => {
    const onSidebarClickCapture = vi.fn();
    render(
      <AppShellFrame
        sidebar={<button type='button'>Library</button>}
        main={<div>Main Content</div>}
        onSidebarClickCapture={onSidebarClickCapture}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));

    expect(onSidebarClickCapture).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('app-shell-sidebar-mount')).toHaveAttribute(
      'data-app-shell-sidebar-mount',
      'true'
    );
  });

  it('keeps main-plane geometry on the same reduced-motion-safe rail contract', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        rightPanel={<div>Right rail</div>}
      />
    );

    const mainPlane = screen
      .getByTestId('app-shell-right-rail')
      .closest('[data-app-shell-main-plane]');

    expect(mainPlane).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-cinematic',
      'motion-reduce:transition-none'
    );
    expect(screen.getByTestId('app-shell-scroll')).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-cinematic',
      'motion-reduce:transition-none'
    );
    expect(
      screen
        .getByTestId('app-shell-scroll')
        .closest('[data-app-shell-content-column]')
    ).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-cinematic',
      'motion-reduce:transition-none'
    );
  });

  it('renders the chat ambient gradient full-bleed behind the header on chat routes', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header data-testid='fixture-header'>Header</header>}
        main={<div>Main Content</div>}
        chatAmbientGradient
      />
    );

    const mainContent = screen.getByRole('main');
    const gradient = screen.getByTestId('chat-ambient-gradient');
    const header = screen.getByTestId('fixture-header');

    // The gradient is a direct child of the route content column, spanning its
    // full box (inset-0) — its top edge is the top of the panel, above the
    // header band, not below it (#13386).
    const routeContent = mainContent.querySelector(
      '[data-app-shell-main-content]'
    );
    expect(gradient.parentElement).toBe(routeContent);
    expect(gradient).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
    // Stacking guard: the wash is opaque, so it MUST paint beneath the
    // in-flow header — that requires a negative z-index inside an isolated
    // isolated route column (an absolute z-auto sibling would paint on top of static
    // content regardless of DOM order). jsdom can't compute stacking, so pin
    // the classes that make it correct.
    expect(gradient).toHaveClass('-z-10');
    expect(routeContent).toHaveClass('isolate');
    expect(mainContent).toContainElement(header);
    expect(gradient.style.backgroundImage).toContain('radial-gradient');
  });

  it('omits the shell-level ambient gradient on non-chat routes', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
      />
    );

    expect(screen.queryByTestId('chat-ambient-gradient')).toBeNull();
  });

  it('reserves an in-flow shell tray below main for the shared audio player', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        audioPlayer={<div data-testid='audio-player'>Player</div>}
      />
    );

    const main = screen.getByRole('main');
    const audioPlayer = screen.getByTestId('audio-player');
    const tray = screen.getByTestId('app-shell-audio-tray');

    expect(audioPlayer).toBeInTheDocument();
    expect(main).not.toContainElement(audioPlayer);
    expect(tray).toContainElement(audioPlayer);
    expect(tray.parentElement).toHaveAttribute(
      'data-app-shell-content-column',
      'true'
    );
    expect(tray).toHaveClass('shrink-0');
  });

  it('mounts mobile navigation in the shared in-flow bottom surface', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        main={<div>Main Content</div>}
        mobileBottomNav={<nav aria-label='Mobile Navigation'>Nav</nav>}
      />
    );

    const surface = screen.getByTestId('app-shell-mobile-bottom-surface');
    expect(surface).toHaveClass(
      'system-b-app-mobile-bottom-surface',
      'shrink-0',
      'lg:hidden'
    );
    expect(surface).toContainElement(
      screen.getByRole('navigation', { name: 'Mobile Navigation' })
    );
    expect(surface).not.toHaveClass('fixed', 'absolute');
  });
});
