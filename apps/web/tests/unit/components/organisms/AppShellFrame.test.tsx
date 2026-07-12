import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';

describe('AppShellFrame', () => {
  it('renders the shellChatV1 design when explicitly opted in', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        variant='shellChatV1'
      />
    );

    const mainContent = screen.getByRole('main');

    expect(mainContent).toHaveAttribute('id', 'main-content');
    expect(mainContent).not.toHaveAttribute('tabindex');
    expect(mainContent.closest('[data-shell-design]')).toHaveAttribute(
      'data-shell-design',
      'shellChatV1'
    );
    expect(mainContent).toHaveClass('lg:shadow-(--linear-app-shell-shadow)');
    // #main-content keeps its full rounded shell radius — no Electron override
    // strips the top corners now that the header lives inside the card.
    expect(mainContent).toHaveClass('lg:rounded-(--linear-app-shell-radius)');
    expect(mainContent.querySelector('div.flex.flex-1')).toHaveClass(
      'lg:gap-(--linear-app-shell-gap)'
    );
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(screen.getByText('Main Content')).toBeInTheDocument();
    // Header renders exactly once inside main (no duplicate-render hack).
    const headers = screen.getAllByText('Header');
    expect(headers).toHaveLength(1);
    expect(mainContent).toContainElement(headers[0] as HTMLElement);
  });

  it('defaults to the legacy variant so flag-off callers match production', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
      />
    );

    expect(
      screen.getByRole('main').closest('[data-shell-design]')
    ).toHaveAttribute('data-shell-design', 'legacy');
  });

  it('can render the legacy flat shell frame for the old design', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        variant='legacy'
      />
    );

    const mainContent = screen.getByRole('main');

    expect(mainContent.closest('[data-shell-design]')).toHaveAttribute(
      'data-shell-design',
      'legacy'
    );
    expect(mainContent).toHaveClass('lg:border-l');
    // Guard against the production Tailwind v4 token form (not the legacy
    // [var(...)] spelling) so this negative assert actually tracks the class
    // AppShellFrame emits for shellChatV1.
    expect(mainContent).not.toHaveClass(
      'lg:shadow-(--linear-app-shell-shadow)'
    );
    expect(mainContent.querySelector('div.flex.flex-1')).not.toHaveClass(
      'lg:gap-(--linear-app-shell-gap)'
    );
  });

  it('keeps the right rail outside the non-scrolling shell clip', () => {
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
    expect(scrollPane).not.toContainElement(rightRail);
    expect(rightRail).toContainElement(
      screen.getByTestId('fixture-right-rail')
    );
    expect(rightRail).toHaveClass('sticky', 'top-0');
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
    expect(mount).toContainElement(screen.getByTestId('fixture-sidebar'));
  });

  it('renders the chat ambient gradient full-bleed behind the header on chat routes', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header data-testid='fixture-header'>Header</header>}
        main={<div>Main Content</div>}
        variant='shellChatV1'
        chatAmbientGradient
      />
    );

    const mainContent = screen.getByRole('main');
    const gradient = screen.getByTestId('chat-ambient-gradient');
    const header = screen.getByTestId('fixture-header');

    // The gradient is a direct child of the shell content panel, spanning its
    // full box (inset-0) — its top edge is the top of the panel, above the
    // header band, not below it (#13386).
    expect(gradient.parentElement).toBe(mainContent);
    expect(gradient).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
    // Stacking guard: the wash is opaque, so it MUST paint beneath the
    // in-flow header — that requires a negative z-index inside an isolated
    // <main> (an absolute z-auto sibling would paint on top of static
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

  it('renders the shared audio player slot inside the shell frame', () => {
    render(
      <AppShellFrame
        sidebar={<aside>Sidebar</aside>}
        header={<header>Header</header>}
        main={<div>Main Content</div>}
        audioPlayer={<div data-testid='audio-player'>Player</div>}
      />
    );

    expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByTestId('audio-player')
    );
  });
});
