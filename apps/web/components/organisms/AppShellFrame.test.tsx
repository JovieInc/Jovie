import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppShellFrame } from './AppShellFrame';

const sidebar = (
  <nav aria-label='Workspace' className='h-full w-56 p-4'>
    Navigation
  </nav>
);

describe('AppShellFrame certificate', () => {
  it('renders the live frame with one main landmark and is axe-clean', async () => {
    const { container } = render(
      <AppShellFrame
        sidebar={sidebar}
        header={<div className='px-3 py-2'>Library</div>}
        main={<p>Main content</p>}
      />
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main.closest('[data-app-shell-frame="true"]')).not.toBeNull();
    expect(screen.getByTestId('app-shell-sidebar-mount')).toContainElement(
      screen.getByRole('navigation', { name: 'Workspace' })
    );
    expect(container.querySelector('[data-app-shell-header]')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps the loading placeholder off the live landmark id and frame attribute', async () => {
    const { container } = render(
      <AppShellFrame
        placeholder
        sidebar={sidebar}
        main={<p aria-busy='true'>Loading chat</p>}
      />
    );

    const main = screen.getByRole('main');
    expect(main).not.toHaveAttribute('id');
    expect(container.querySelector('[data-app-shell-frame]')).toBeNull();
    expect(
      container.querySelector('[data-app-shell-placeholder="true"]')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('pushes the route with an inspector column and stays axe-clean', async () => {
    const { container } = render(
      <AppShellFrame
        sidebar={sidebar}
        header={<div className='px-3 py-2'>Work</div>}
        main={<p>Route content</p>}
        rightPanel={<p>Entity details</p>}
      />
    );

    const rail = screen.getByRole('complementary', { name: 'Context Panel' });
    expect(rail).toHaveAttribute('data-rail-below-header', 'true');
    expect(rail).toHaveTextContent('Entity details');
    await expectNoA11yViolations(container);
  });

  it('paints the chat wash, audio tray and mobile nav without new landmarks', async () => {
    const { container } = render(
      <AppShellFrame
        chatAmbientGradient
        flushContent
        sidebar={sidebar}
        main={<p>Chat</p>}
        audioPlayer={<p>Now playing</p>}
        mobileBottomNav={<p>Mobile navigation</p>}
      />
    );

    expect(screen.getByTestId('chat-ambient-gradient')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByTestId('app-shell-audio-tray')).toHaveTextContent(
      'Now playing'
    );
    expect(
      screen.getByTestId('app-shell-mobile-bottom-surface')
    ).toHaveTextContent('Mobile navigation');
    expect(
      container.querySelector('[data-app-shell-content-inset="true"]')
    ).not.toHaveClass('p-(--app-shell-content-inset)');
    await expectNoA11yViolations(container);
  });
});
