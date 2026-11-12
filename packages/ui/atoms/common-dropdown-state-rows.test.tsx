import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { EmptyState, LoadingState } from './common-dropdown-state-rows';

describe('dropdown state rows', () => {
  it('renders the loading row as one disabled, keyboard-skipped menuitem', () => {
    render(<LoadingState />);

    const row = screen.getByRole('menuitem');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAttribute('data-disabled');
    expect(row).toHaveAttribute('tabindex', '-1');
    expect(row).toHaveAttribute('data-slot', 'common-dropdown-loading');
    expect(screen.getByText('Loading menu items')).toHaveClass('sr-only');
  });

  it('renders the empty row with its polite status message', () => {
    render(<EmptyState message='No actions found' />);

    const row = screen.getByRole('menuitem', { name: 'No actions found' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAttribute('data-slot', 'common-dropdown-empty');
  });

  it('has no axe violations for loading, long, and right-to-left rows', async () => {
    const loading = render(
      <div role='menu' aria-label='Release actions'>
        <LoadingState />
      </div>
    );
    await expectNoA11yViolations(loading.container);
    cleanup();

    const longMessage =
      'No actions match this search in the summer single menu, including the extended club mix and its territorial variants';
    const long = render(
      <div role='menu' aria-label='Release actions'>
        <EmptyState message={longMessage} />
      </div>
    );
    expect(screen.getByRole('menuitem', { name: longMessage })).toBeVisible();
    await expectNoA11yViolations(long.container);
    cleanup();

    const rtlMessage = 'لا توجد إجراءات مطابقة';
    const rtl = render(
      <div dir='rtl' role='menu' aria-label='إجراءات الإصدار'>
        <EmptyState message={rtlMessage} />
      </div>
    );
    expect(screen.getByRole('menuitem', { name: rtlMessage })).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
