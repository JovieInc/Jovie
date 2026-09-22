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
});
