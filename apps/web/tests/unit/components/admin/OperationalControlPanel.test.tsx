import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OperationalControlPanel } from '@/features/admin/OperationalControlPanel';

vi.mock('@/components/features/admin/WaitlistSettingsPanel', () => ({
  WaitlistSettingsPanel: () => <div>Waitlist settings</div>,
}));

vi.mock('@/components/features/admin/campaigns/CampaignSettingsPanel', () => ({
  CampaignSettingsPanel: () => <div>Campaign settings</div>,
}));

describe('OperationalControlPanel', () => {
  it('renders the consolidated operational controls card', () => {
    render(<OperationalControlPanel />);

    expect(screen.getByTestId('operational-control-panel')).toBeInTheDocument();
    expect(screen.getByText('Operational controls')).toBeInTheDocument();
    expect(screen.getByText('Dev toolbar')).toBeInTheDocument();
    expect(screen.getByText('Waitlist settings')).toBeInTheDocument();
    expect(screen.getByText('Campaign settings')).toBeInTheDocument();
  });
});
