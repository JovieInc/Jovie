import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OperationalControlPanel } from '@/features/admin/OperationalControlPanel';

describe('OperationalControlPanel', () => {
  it('renders only the operational environment controls', () => {
    render(<OperationalControlPanel />);

    expect(screen.getByTestId('operational-control-panel')).toBeInTheDocument();
    expect(screen.getByText('Operational controls')).toBeInTheDocument();
    expect(screen.getByText('Dev toolbar')).toBeInTheDocument();
    expect(screen.queryByText('Waitlist settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Campaign settings')).not.toBeInTheDocument();
  });
});
