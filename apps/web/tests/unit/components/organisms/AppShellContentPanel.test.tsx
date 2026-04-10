import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';

describe('AppShellContentPanel', () => {
  it('renders a framed full-width content container by default', () => {
    const { container } = render(
      <AppShellContentPanel data-testid='shell-panel'>
        <div>Panel content</div>
      </AppShellContentPanel>
    );

    expect(screen.getByTestId('shell-panel')).toBeInTheDocument();
    expect(screen.getByText('Panel content')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="shell-panel"]')).toHaveClass(
      'overflow-hidden'
    );
    expect(container.querySelector('.rounded-xl.border')).toBeTruthy();
  });

  it('supports unframed form layouts with page scrolling', () => {
    const { container } = render(
      <AppShellContentPanel
        maxWidth='form'
        frame='none'
        contentPadding='compact'
        scroll='page'
      >
        <div>Settings content</div>
      </AppShellContentPanel>
    );

    expect(screen.getByText('Settings content')).toBeInTheDocument();
    const outerPanel = container.querySelector('.mx-auto');
    expect(outerPanel).toHaveClass('max-w-(--app-shell-content-max-form)');
    expect(container.innerHTML).toContain('px-3 py-3 sm:px-3.5 sm:py-3.5');
    expect(container.innerHTML).toContain('overflow-visible');
  });

  it('keeps the toolbar and content on the same outer inset contract', () => {
    const { container } = render(
      <AppShellContentPanel toolbar={<div>Toolbar</div>}>
        <div>Panel content</div>
      </AppShellContentPanel>
    );

    expect(screen.getByText('Toolbar')).toBeInTheDocument();
    expect(screen.getByText('Panel content')).toBeInTheDocument();
    expect(container.innerHTML).toContain('px-2.5 py-2.5 sm:px-3 sm:py-3');
  });

  it('keeps panel scrolling constrained by default', () => {
    const { container } = render(
      <AppShellContentPanel>
        <div>Scrollable panel</div>
      </AppShellContentPanel>
    );

    expect(screen.getByText('Scrollable panel')).toBeInTheDocument();
    expect(container.innerHTML).toContain('min-h-0 overflow-hidden');
  });
});
