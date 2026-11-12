import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
