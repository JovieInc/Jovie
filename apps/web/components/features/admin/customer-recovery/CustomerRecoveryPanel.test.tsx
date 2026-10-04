import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CustomerRecoveryDossier,
  CustomerRecoveryResult,
} from '@/lib/admin/customer-recovery';
import { CustomerRecoveryPanel } from './CustomerRecoveryPanel';

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

function buildDossier(
  overrides: Partial<CustomerRecoveryDossier> = {}
): CustomerRecoveryDossier {
  return {
    identity: {
      dedupeKey: 'user:u1',
      displayName: 'Phoebe Bridgers',
      email: 'phoebe@example.com',
      handle: 'phoebe',
      stage: 'claimed',
      overrideStage: null,
      sources: ['waitlist', 'creator_profile'],
      certifiedAt: null,
      activityAt: null,
      userId: 'u1',
      creatorProfileId: 'cp1',
      leadId: null,
      waitlistEntryId: 'w1',
    },
    account: {
      userStatus: 'active',
      plan: 'pro',
      isPro: true,
      isPaying: true,
      deletedAt: null,
    },
    authority: {
      profileClaimed: true,
      claimedAt: '2026-09-01T00:00:00.000Z',
      isVerified: false,
      ingestionStatus: 'failed',
      lastIngestionError: 'spotify timeout',
      hasSpotifySource: true,
    },
    admission: {
      status: 'approved',
      approvedAt: '2026-08-01T00:00:00.000Z',
      invitedAt: null,
      signedUpAt: '2026-08-02T00:00:00.000Z',
    },
    connections: { activeSocialLinks: 4 },
    launch: { releaseCount: 3, latestReleaseTitle: 'Punisher' },
    recentOperations: [
      {
        type: 'artist-ingest',
        result: 'failed',
        failureReason: 'spotify timeout',
        createdAt: '2026-09-15T00:00:00.000Z',
      },
    ],
    blocker: {
      kind: 'ingestion-failed',
      summary: 'Artist ingestion failed and can be re-run.',
      operation: 'rerun-ingestion',
      preconditionNote: null,
    },
    ...overrides,
  };
}

function buildResult(
  overrides: Partial<CustomerRecoveryResult> = {}
): CustomerRecoveryResult {
  return {
    search: 'phoebe',
    matches: [],
    dossier: null,
    error: null,
    generatedAt: '2026-10-02T12:00:00.000Z',
    ...overrides,
  };
}

describe('CustomerRecoveryPanel', () => {
  it('renders the search form and reports when no canonical customer matches', () => {
    render(<CustomerRecoveryPanel result={buildResult()} />);

    expect(screen.getByTestId('customer-recovery-search')).toBeInTheDocument();
    expect(
      screen.getByText('No canonical customer matches “phoebe”.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Evidence snapshot generated 2026-10-02T12:00:00\.000Z/)
    ).toBeInTheDocument();
  });

  it('lists candidate customers linked to the keyed recovery view when ambiguous', () => {
    render(
      <CustomerRecoveryPanel
        result={buildResult({
          matches: [
            {
              dedupeKey: 'user:u1',
              displayName: 'Phoebe Bridgers',
              email: 'phoebe@example.com',
              handle: 'phoebe',
              stage: 'claimed',
            },
            {
              dedupeKey: 'lead:l2',
              displayName: null,
              email: 'p.b@example.com',
              handle: null,
              stage: 'suggested',
            },
          ],
        })}
      />
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      'href',
      expect.stringContaining('key=user%3Au1')
    );
    expect(links[0]).toHaveAttribute(
      'href',
      expect.stringContaining('view=recovery')
    );
    expect(links[1]).toHaveAttribute(
      'href',
      expect.stringContaining('key=lead%3Al2')
    );
    expect(
      screen.queryByTestId('customer-recovery-dossier')
    ).not.toBeInTheDocument();
  });

  it('distinguishes unavailable evidence from an empty search result', () => {
    render(
      <CustomerRecoveryPanel result={buildResult({ error: 'unavailable' })} />
    );

    expect(screen.getByTestId('customer-recovery-error')).toHaveTextContent(
      'temporarily unavailable'
    );
    expect(
      screen.queryByText('No canonical customer matches “phoebe”.')
    ).not.toBeInTheDocument();
  });

  it('renders the dossier facts and the supported recovery action', () => {
    render(
      <CustomerRecoveryPanel
        result={buildResult({
          dossier: buildDossier(),
          matches: [
            {
              dedupeKey: 'user:u1',
              displayName: 'Phoebe Bridgers',
              email: 'phoebe@example.com',
              handle: 'phoebe',
              stage: 'claimed',
            },
          ],
        })}
      />
    );

    const dossier = screen.getByTestId('customer-recovery-dossier');
    expect(dossier).toBeInTheDocument();
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('phoebe@example.com')).toBeInTheDocument();
    expect(screen.getByText('pro (pro flag)')).toBeInTheDocument();
    expect(screen.getByText('spotify timeout')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Re-run Artist Ingestion' })
    ).toHaveAttribute('data-profile-id', 'cp1');
    expect(screen.getByText(/artist-ingest/)).toBeInTheDocument();
  });

  it('offers no recovery button and shows the read-only note when preconditions fail', () => {
    render(
      <CustomerRecoveryPanel
        result={buildResult({
          dossier: buildDossier({
            blocker: {
              kind: 'ingestion-in-flight',
              summary: 'An ingestion run is already in flight.',
              operation: null,
              preconditionNote: 'Wait for the current run to finish.',
            },
          }),
        })}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Re-run Artist Ingestion' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Wait for the current run to finish.')
    ).toBeInTheDocument();
  });
});
