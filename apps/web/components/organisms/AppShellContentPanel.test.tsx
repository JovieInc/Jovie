import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppShellContentPanel } from './AppShellContentPanel';

describe('AppShellContentPanel', () => {
  it('renders the toolbar above framed, padded content', async () => {
    const { container } = render(
      <AppShellContentPanel
        aria-label='Releases'
        toolbar={<div>Table toolbar</div>}
        data-testid='panel'
      >
        <p>Authenticated page content</p>
      </AppShellContentPanel>
    );

    const panel = screen.getByRole('region', { name: 'Releases' });
    expect(panel).toBe(screen.getByTestId('panel'));
    expect(panel).toHaveClass('overflow-hidden');
    const toolbar = screen.getByText('Table toolbar');
    const content = screen.getByText('Authenticated page content');
    expect(
      toolbar.compareDocumentPosition(content) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(content.parentElement).toHaveClass(
      'px-(--app-shell-content-padding-x)'
    );
    await expectNoA11yViolations(container);
  });

  it('marks table surfaces and drops padding when asked', async () => {
    const { container } = render(
      <AppShellContentPanel
        aria-label='Audience'
        surfaceMode='table'
        contentPadding='none'
      >
        <p>Rows</p>
      </AppShellContentPanel>
    );

    const panel = screen.getByRole('region', { name: 'Audience' });
    expect(panel).toHaveAttribute('data-shell-surface-mode', 'table');
    expect(screen.getByText('Rows').parentElement).not.toHaveClass(
      'px-(--app-shell-content-padding-x)'
    );
    await expectNoA11yViolations(container);
  });

  it('scrolls the page within a reading column for long content', async () => {
    const { container } = render(
      <AppShellContentPanel
        aria-label='Settings'
        scroll='page'
        maxWidth='reading'
      >
        {Array.from({ length: 12 }, (_, index) => index + 1).map(track => (
          <p key={`track-${track}`}>
            Track {track}: An Unusually Long Track Title That Wraps Across The
            Reading Column
          </p>
        ))}
      </AppShellContentPanel>
    );

    const panel = screen.getByRole('region', { name: 'Settings' });
    expect(panel).toHaveClass('overflow-y-auto');
    expect(panel.firstElementChild).toHaveClass(
      'max-w-(--app-shell-content-max-reading)'
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations without a toolbar or frame in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AppShellContentPanel aria-label='الإصدارات' frame='none'>
          <p>محتوى الصفحة</p>
        </AppShellContentPanel>
      </div>
    );
    expect(screen.getByRole('region', { name: 'الإصدارات' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
