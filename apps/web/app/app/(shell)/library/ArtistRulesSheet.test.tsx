import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArtistRuleView } from '@/lib/artist-rules/types';
import { ArtistRulesSheet } from './ArtistRulesSheet';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const baseRule: ArtistRuleView = {
  id: 'rule-1',
  category: 'visual',
  ruleKey: 'palette',
  instruction: 'never use yellow; make blue primary',
  strength: 'hard_constraint',
  scope: 'artist',
  scopeValue: null,
  allowOverride: false,
  status: 'active',
  provenanceSource: 'artist',
  confirmedAt: '2026-08-28T12:00:00.000Z',
  createdAt: '2026-08-28T12:00:00.000Z',
};

describe('ArtistRulesSheet', () => {
  it('shows confirmed hard rules as non-overridable invariants', async () => {
    render(
      <ArtistRulesSheet
        creatorProfileId='11111111-1111-4111-8111-111111111111'
        initialRules={[baseRule]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Artist Rules' }));
    expect(await screen.findByText(baseRule.instruction)).toBeInTheDocument();
    expect(screen.getAllByText('Hard rule')).not.toHaveLength(0);
    expect(screen.getByText(/Cannot be overridden/)).toBeInTheDocument();
  });

  it('requires explicit confirmation for memory suggestions', async () => {
    render(
      <ArtistRulesSheet
        creatorProfileId='11111111-1111-4111-8111-111111111111'
        initialRules={[
          {
            ...baseRule,
            id: 'rule-2',
            status: 'suggested',
            provenanceSource: 'memory',
            confirmedAt: null,
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Artist Rules' }));
    expect(
      await screen.findByRole('button', { name: 'Confirm Rule' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Suggested from memory/)).toBeInTheDocument();
  });
});
