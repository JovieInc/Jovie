import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseTablePendingShell } from './ReleaseTablePendingShell';

describe('ReleaseTablePendingShell', () => {
  it('renders the loading surface with the expected test id', () => {
    render(<ReleaseTablePendingShell />);
    expect(screen.getByTestId('releases-loading')).toBeInTheDocument();
  });

  it('supports a custom test id', () => {
    render(<ReleaseTablePendingShell testId='custom-loading' />);
    expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
  });

  it('reserves the dense release row and content height while loading', () => {
    render(<ReleaseTablePendingShell />);

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'dense');
    expect(table.style.getPropertyValue('--table-row-height')).toBe('32px');
    expect(table.style.getPropertyValue('--table-cell-content-height')).toBe(
      '24px'
    );
    expect(screen.getByText('Loading table data')).toBeInTheDocument();
  });
});
