import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    expect(container.innerHTML).toContain('p-(--app-shell-content-inset)');
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

describe('PageShell interaction and accessibility', () => {
  it('runs the header action from pointer and keyboard input', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { container } = render(
      <PageShell aria-label='Releases'>
        <PageHeader
          title='Releases'
          description='Manage your catalog.'
          action={
            <button type='button' onClick={onAdd}>
              Add release
            </button>
          }
        />
        <PageContent>Page content</PageContent>
      </PageShell>
    );

    const action = screen.getByRole('button', { name: 'Add release' });
    await user.click(action);
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it.each([
    [
      'empty',
      <PageShell key='page' aria-label='Releases'>
        <PageHeader title='Releases' />
        <PageContent>
          <p>No releases yet</p>
        </PageContent>
      </PageShell>,
    ],
    [
      'long content',
      <PageShell key='page' aria-label='Releases' scroll='page'>
        <PageHeader
          title='The Extraordinarily Long Album Title That Keeps Going Well Past Any Reasonable Line Length (Deluxe Anniversary Remastered Edition)'
          description='A description that is also far longer than the header has room for.'
        />
        <PageContent>
          {Array.from({ length: 12 }, (_, index) => index + 1).map(track => (
            <p key={`track-${track}`}>
              Track {track}: An Unusually Long Track Title
            </p>
          ))}
        </PageContent>
      </PageShell>,
    ],
    [
      'right-to-left',
      <div key='page' dir='rtl' lang='ar'>
        <PageShell aria-label='الإصدارات'>
          <PageHeader title='الإصدارات' description='إدارة الكتالوج الخاص بك' />
          <PageContent>محتوى الصفحة</PageContent>
        </PageShell>
      </div>,
    ],
  ])('has no axe violations in the %s state', async (_label, ui) => {
    const { container } = render(ui);
    await expectNoA11yViolations(container);
  });
});
