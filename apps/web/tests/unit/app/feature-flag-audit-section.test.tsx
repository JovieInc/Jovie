import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeatureFlagAuditRow } from '@/app/app/(shell)/admin/features/FeatureFlagAuditSection';
import { FeatureFlagAuditSection } from '@/app/app/(shell)/admin/features/FeatureFlagAuditSection';

function event(overrides: Partial<FeatureFlagAuditRow>): FeatureFlagAuditRow {
  return {
    id: 'evt-1',
    flagKey: 'spotify_oauth',
    name: 'Spotify Oauth',
    envTier: 'prod',
    action: 'enable',
    actor: 'tim',
    previousValue: null,
    previousSource: 'default',
    previousEffective: null,
    newValue: true,
    newSource: 'override',
    newEffective: true,
    reason: 'launch',
    createdAt: '2026-09-25T00:00:00.000Z',
    createdAtLabel: 'Sep 25',
    canRollback: false,
    ...overrides,
  };
}

describe('FeatureFlagAuditSection', () => {
  it('shows a missing effective value as an em dash and a boolean as On or Off', () => {
    render(
      <FeatureFlagAuditSection
        currentTier='prod'
        events={[
          event({}),
          event({
            id: 'evt-2',
            action: 'disable',
            previousEffective: false,
            previousSource: 'override',
            newEffective: false,
            newSource: 'default',
            newValue: null,
          }),
        ]}
      />
    );

    const first = screen.getByTestId('audit-event-evt-1');
    const second = screen.getByTestId('audit-event-evt-2');
    expect(first).toHaveTextContent('— · Default → On · Override');
    expect(second).toHaveTextContent('Off · Override → Off · Default');
  });
});
