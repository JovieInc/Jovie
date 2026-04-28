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
    expect(mainContent).toHaveClass(
      'lg:shadow-[var(--linear-app-shell-shadow)]'
    );
    expect(mainContent.querySelector('div.flex.flex-1')).toHaveClass(
      'lg:gap-[var(--linear-app-shell-gap)]'
    );
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Main Content')).toBeInTheDocument();
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
    expect(mainContent).not.toHaveClass(
      'lg:shadow-[var(--linear-app-shell-shadow)]'
    );
    expect(mainContent.querySelector('div.flex.flex-1')).not.toHaveClass(
      'lg:gap-[var(--linear-app-shell-gap)]'
    );
  });
});
