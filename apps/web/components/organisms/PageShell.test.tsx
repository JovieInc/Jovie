import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageContent, PageHeader, PageShell } from './PageShell';

describe('PageShell compatibility contract', () => {
  it('forwards the canonical content-panel API and section attributes', () => {
    const { container } = render(
      <PageShell
        data-testid='page-shell'
        aria-label='Release workspace'
        toolbar={<div>Toolbar</div>}
        maxWidth='reading'
        frame='none'
        contentPadding='compact'
        surfaceMode='table'
        scroll='page'
        className='custom-shell'
      >
        <div>Release content</div>
      </PageShell>
    );

    const shell = screen.getByTestId('page-shell');
    expect(shell.tagName).toBe('SECTION');
    expect(shell).toHaveAttribute('aria-label', 'Release workspace');
    expect(shell).toHaveAttribute('data-shell-surface-mode', 'table');
    expect(shell).toHaveClass(
      'custom-shell',
      'overflow-y-auto',
      'overflow-x-hidden'
    );
    expect(screen.getByText('Toolbar')).toBeInTheDocument();
    expect(screen.getByText('Release content')).toBeInTheDocument();
    expect(container.querySelector('.mx-auto')).toHaveClass(
      'max-w-(--app-shell-content-max-reading)',
      'bg-(--app-shell-content-surface)'
    );
    expect(container.innerHTML).toContain('px-3 py-3 sm:px-3.5 sm:py-3.5');
  });

  it('keeps PageHeader semantics and action placement stable', () => {
    render(
      <PageHeader
        title='Releases'
        description='Manage your catalog.'
        breadcrumbs={<span>Library</span>}
        action={<button type='button'>Add release</button>}
      />
    );

    expect(
      screen.getByRole('heading', { name: /releases/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Manage your catalog.')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add release' })
    ).toBeInTheDocument();
  });

  it('keeps PageContent padding explicit and removable', () => {
    const { rerender } = render(<PageContent>Content</PageContent>);
    expect(screen.getByText('Content')).toHaveClass(
      'px-(--app-shell-content-padding-x)',
      'py-(--app-shell-content-padding-y)'
    );

    rerender(<PageContent noPadding>Content</PageContent>);
    expect(screen.getByText('Content')).not.toHaveClass(
      'px-(--app-shell-content-padding-x)'
    );
  });
});
