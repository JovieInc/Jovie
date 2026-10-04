import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutboundReadinessPanel } from './OutboundReadinessPanel';

describe('OutboundReadinessPanel', () => {
  it('lists each item with its status and nested receipts', () => {
    render(
      <OutboundReadinessPanel
        isLoading={false}
        isError={false}
        readiness={{
          generatedAt: '2026-10-04T12:00:00Z',
          ready: 0,
          total: 1,
          items: [
            {
              id: 'cone',
              label: 'Revenue cone (ACQUISITION_ELIGIBLE)',
              status: 'red',
              detail: '1 of 8 receipts not green',
              owner: 'revenue',
              href: null,
              children: [
                {
                  id: 'cone:payment_entitlement',
                  label: 'Golden Path',
                  status: 'red',
                  detail: 'Fix the Golden Path lane failure.',
                  owner: 'billing',
                  href: 'https://linear.app/jovie/issue/JOV-7192',
                },
              ],
            },
          ],
        }}
      />
    );
    expect(screen.getByTestId('readiness-cone')).toHaveAttribute(
      'data-status',
      'red'
    );
    expect(screen.getByRole('link', { name: 'Golden Path' })).toHaveAttribute(
      'href',
      'https://linear.app/jovie/issue/JOV-7192'
    );
    expect(screen.getAllByLabelText('Blocking')).toHaveLength(2);
  });

  it('says when readiness cannot load', () => {
    render(
      <OutboundReadinessPanel readiness={undefined} isLoading={false} isError />
    );
    expect(
      screen.getByText('Readiness could not load. Refresh to try again.')
    ).toBeInTheDocument();
  });
});
