import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    const appShellFrame = mainContent.closest('[data-app-shell-frame]');
    const desktopTitlebar = screen.getByTestId('electron-titlebar-row');

    expect(mainContent).toHaveAttribute('id', 'main-content');
    expect(mainContent).not.toHaveAttribute('tabindex');
    expect(appShellFrame).toBeInTheDocument();
    expect(appShellFrame).toContainElement(desktopTitlebar);
    expect(
      appShellFrame?.querySelectorAll('[data-testid="electron-titlebar-row"]')
    ).toHaveLength(1);
    const shellBody = mainContent.closest('[data-app-shell-body]');
    expect(shellBody).toHaveAttribute('data-shell-rail-motion', 'coordinated');
    expect(shellBody).toHaveAttribute(
      'data-electron-top-gap-owner',
      'titlebar'
    );
    expect(shellBody).toHaveClass(
      'transition-[gap,padding]',
      'duration-shell-rail',
      'ease-cinematic',
      'motion-reduce:transition-none'
    );
    expect(mainContent).toHaveClass('lg:shadow-(--app-shell-shadow)');
    expect(mainContent).toHaveClass('bg-(--app-shell-content-surface)');
    expect(mainContent).not.toHaveClass('bg-(--color-bg-surface-0)/90');
    // #main-content keeps its full rounded shell radius — no Electron override
    // strips the top corners now that the header lives inside the card.
    expect(mainContent).toHaveClass('lg:rounded-(--app-shell-radius)');
    // Founder lock 2026-09-25: one rounded, borderless panel — no border.
    expect(mainContent).not.toHaveClass('lg:border');
    expect(mainContent).not.toHaveClass('lg:border-(--app-shell-border)');
    const routeContent = mainContent.querySelector(
      '[data-app-shell-main-content]'
    );
    // The content inset belongs to the scroll wrapper, not the shared
    // header+route column: the header spans the panel edge-to-edge so the
    // top row reads as one clipped plane (JOV-7207).
    expect(routeContent).not.toHaveClass('p-(--app-shell-content-inset)');
    expect(
      mainContent.querySelector('[data-app-shell-content-inset]')
    ).toHaveClass('p-(--app-shell-content-inset)');
    expect(mainContent.closest('[data-app-shell-main-plane]')).not.toHaveClass(
      'lg:gap-(--app-shell-gap)'
    );
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(screen.getByText('Main Content')).toBeInTheDocument();
    expect(screen.getByTestId('overlay-interaction-guard')).toBeInTheDocument();
    // Header renders exactly once inside main (no duplicate-render hack).
    const headers = screen.getAllByText('Header');
    expect(headers).toHaveLength(1);
    expect(mainContent).toContainElement(headers[0] as HTMLElement);
  });

  it('keeps the header and route on the same token-owned paint plane', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main content</div>}
      />
    );

    const plane = screen.getByRole('main');
    // A white blend overlay brightened only the route while the opaque
    // header masked it, creating an extra elevation despite identical tokens.
    const decorativePaint = Array.from(
      plane.querySelectorAll<HTMLElement>('*')
    ).filter(element => element.style.mixBlendMode === 'overlay');
    expect(decorativePaint).toHaveLength(0);
    expect(plane).toHaveClass('bg-(--app-shell-content-surface)');
  });

  it('contains the right overlay inside the main route without allocating a column', () => {
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
    expect(rightRail.parentElement).toBe(routeContent);
    expect(routeContent?.parentElement).toBe(main);
    expect(scrollPane).not.toContainElement(rightRail);
    expect(rightRail).toContainElement(
      screen.getByTestId('fixture-right-rail')
    );
    expect(rightRail).toHaveClass('shell-inspector-overlay');
    expect(mainPlane).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-shell-rail',
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

  it('keeps the shell family in the canonical ownership map and boundary', () => {
    // JOV-5596: the shell family is owned through the public canonical
    // boundary; the frame's props type is exported from the component source.
    const frameSource = readFileSync(
      resolve(process.cwd(), 'components/organisms/AppShellFrame.tsx'),
      'utf8'
    );
    expect(frameSource).toContain('export interface AppShellFrameProps');

    const boundarySource = readFileSync(
      resolve(process.cwd(), 'components/canonical/index.ts'),
      'utf8'
    );
    expect(boundarySource).toContain(
      "from '@/components/organisms/AppShellFrame'"
    );
    expect(boundarySource).toContain('AppShellFrameProps');
  });

  it('marks composer focus on the shell frame without changing rail geometry', () => {
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
      'transition-shell-rail-allocation',
      'duration-shell-rail',
      'ease-cinematic',
      'motion-reduce:transition-none'
    );
    expect(mount).toContainElement(screen.getByTestId('fixture-sidebar'));
  });

  it('exposes one semantic boundary for persistent sidebar interactions', () => {
    render(
      <AppShellFrame
        sidebar={<button type='button'>Library</button>}
        main={<div>Main Content</div>}
      />
    );

    expect(screen.getByTestId('app-shell-sidebar-mount')).toHaveAttribute(
      'data-app-shell-sidebar-mount',
      'true'
    );
  });

  it('composes the shared rail-motion tokens on every shell allocation slot (JOV-4522)', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        rightPanel={<div>Right rail</div>}
      />
    );

    // The allocation and main-plane slots must not re-declare ad-hoc
    // duration/easing pairs — they all compose rail-motion.ts constants.
    const frameSource = readFileSync(
      resolve(process.cwd(), 'components/organisms/AppShellFrame.tsx'),
      'utf8'
    );
    expect(frameSource).toContain('SHELL_RAIL_ALLOCATION');
    expect(frameSource).toContain('SHELL_RAIL_MAIN_PLANE');
    expect(frameSource).toContain('SHELL_RAIL_FRAME_GAP');
    expect(frameSource).not.toMatch(/className='[^']*duration-cinematic/);
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
      'duration-shell-rail',
      'motion-reduce:transition-none'
    );
    expect(screen.getByTestId('app-shell-scroll')).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-shell-rail',
      'motion-reduce:transition-none'
    );
    expect(
      screen
        .getByTestId('app-shell-scroll')
        .closest('[data-app-shell-content-column]')
    ).toHaveClass(
      'transition-[flex-basis,width]',
      'duration-shell-rail',
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

    // Sharing the panel's positioning context keeps the wash behind both the
    // header and route, even when the inspector is isolated below the header.
    expect(gradient.parentElement).toBe(mainContent);
    expect(gradient).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
    // Stacking guard: the wash is opaque, so it MUST paint beneath the
    // in-flow header — that requires a negative z-index inside an isolated
    // panel (an absolute z-auto sibling would paint on top of static
    // content regardless of DOM order). jsdom can't compute stacking, so pin
    // the classes that make it correct.
    expect(gradient).toHaveClass('-z-10');
    expect(mainContent).toHaveClass('isolate');
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
    // The tray shares the main panel's column so the dock is exactly the
    // panel's width (JOV-6680).
    expect(tray.parentElement).toHaveAttribute(
      'data-app-shell-main-column',
      'true'
    );
    expect(main.parentElement).toHaveAttribute(
      'data-app-shell-main-column',
      'true'
    );
    expect(tray).toHaveClass('shrink-0');
  });

  it('keeps the inspector within main while the audio dock retains the same column', () => {
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

    expect(main).toContainElement(rail);
    expect(rail).not.toContainElement(tray);
    expect(tray.parentElement).toHaveAttribute(
      'data-app-shell-main-column',
      'true'
    );
    expect(rail.parentElement).toHaveAttribute(
      'data-app-shell-main-content',
      'true'
    );
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
