import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { FleetVerdictPanelView } from './FleetVerdictPanel';

const lanes = {
  heldByReason: { 'needs-human-decision': 4 },
  failedByReason: { 'harness-failed': 61 },
} as unknown as DeliveryLanes;

describe('FleetVerdictPanelView', () => {
  it('names the level, every reason, and the counts behind it', () => {
    render(
      <FleetVerdictPanelView
        verdict={{
          level: 'degraded',
          headline:
            'Fleet degraded: Remediation alerts are not being acknowledged',
          reasons: ['Remediation alerts are not being acknowledged'],
          capacity: '2 of 3 lanes running',
        }}
        lanes={lanes}
      />
    );
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 lanes running')).toBeInTheDocument();
    expect(screen.getByText('failed: harness-failed')).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText('needs-human-decision')).toBeInTheDocument();
  });

  it('renders an unmeasured fleet without a healthy claim', () => {
    render(
      <FleetVerdictPanelView
        verdict={{
          level: 'unknown',
          headline: 'Fleet health not measured',
          reasons: [],
          capacity: null,
        }}
        lanes={null}
      />
    );
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).toBeNull();
  });
});
