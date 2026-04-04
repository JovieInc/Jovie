import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';

describe('AppShellFrame', () => {
  it('keeps the main content landmark non-focusable while rendering content', () => {
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
});
