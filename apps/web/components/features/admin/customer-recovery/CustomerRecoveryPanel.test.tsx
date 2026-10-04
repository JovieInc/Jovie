import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerRecoveryResult } from '@/lib/admin/customer-recovery';
import { CustomerRecoveryPanel } from './CustomerRecoveryPanel';
import { readOnlyDossier, recoveryResult } from './fixtures';

vi.mock('./RerunIngestionButton', () => ({
  RerunIngestionButton: ({
    creatorProfileId,
  }: {
    creatorProfileId: string;
  }) => (
    <button type='button' data-profile-id={creatorProfileId}>
      Re-run Artist Ingestion
    </button>
  ),
}));

const show = (overrides: Partial<CustomerRecoveryResult>) =>
  render(
    <CustomerRecoveryPanel result={{ ...recoveryResult, ...overrides }} />
  );
const match = (dedupeKey: string, email: string) => ({
  dedupeKey,
  displayName: null,
  email,
  handle: null,
  stage: 'lead',
});

describe('CustomerRecoveryPanel', () => {
  it('distinguishes no matches from unavailable evidence', () => {
    const { rerender } = show({ dossier: null });
    expect(
      screen.getByText(/No canonical customer matches/)
    ).toBeInTheDocument();

    rerender(
      <CustomerRecoveryPanel
        result={{ ...recoveryResult, dossier: null, error: 'unavailable' }}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'temporarily unavailable'
    );
    expect(screen.queryByText(/No canonical customer matches/)).toBeNull();
  });

  it('requires an explicit keyed selection for ambiguous matches', () => {
    show({
      dossier: null,
      matches: [
        match('user:u1', 'phoebe@example.com'),
        match('lead:l2', 'p.b@example.com'),
      ],
    });

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      'href',
      expect.stringContaining('user%3Au1')
    );
    expect(screen.queryByText('Identity')).toBeNull();
  });

  it('renders evidence, the supported action, and read-only refusals', () => {
    const { rerender } = show({});
    expect(screen.getByText('phoebe@example.com')).toBeInTheDocument();
    expect(screen.getByText('pro (pro flag)')).toBeInTheDocument();
    expect(screen.getByText('spotify timeout')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Re-run Artist Ingestion' })
    ).toHaveAttribute('data-profile-id', 'cp1');

    rerender(
      <CustomerRecoveryPanel
        result={{
          ...recoveryResult,
          dossier: readOnlyDossier,
        }}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Re-run Artist Ingestion' })
    ).toBeNull();
    expect(
      screen.getByText(/Wait for the current ingestion run/)
    ).toBeInTheDocument();
  });
});
