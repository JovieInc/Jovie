import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import type { ApproveStatus } from './types';
import { useWaitlistColumns } from './WaitlistTableColumns';

function makeEntry(
  overrides: Partial<WaitlistEntryRow> = {}
): WaitlistEntryRow {
  return {
    id: 'wl_1',
    fullName: 'Ari Lane',
    email: 'ari@example.com',
    primaryGoal: 'streams',
    primarySocialUrl: 'https://instagram.com/ari',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'https://instagram.com/ari',
    spotifyUrl: 'https://open.spotify.com/artist/ari',
    spotifyUrlNormalized: 'https://open.spotify.com/artist/ari',
    spotifyArtistName: 'Ari Lane',
    heardAbout: null,
    status: 'new',
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  };
}

function ColumnsHarness({
  entry,
  approveStatuses = {},
  onApprove = vi.fn(),
}: {
  readonly entry: WaitlistEntryRow;
  readonly approveStatuses?: Readonly<Record<string, ApproveStatus>>;
  readonly onApprove?: (entry: Pick<WaitlistEntryRow, 'id' | 'status'>) => void;
}) {
  const columns = useWaitlistColumns({ approveStatuses, onApprove });
  return (
    <table>
      <thead>
        <tr>
          {columns.map(column => (
            <th key={column.id}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {columns.map(column => (
            <td key={column.id} data-testid={`cell-${column.id}`}>
              {column.cell(entry, 0)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function renderColumns(
  entry: WaitlistEntryRow,
  options: {
    readonly approveStatuses?: Readonly<Record<string, ApproveStatus>>;
    readonly onApprove?: (
      entry: Pick<WaitlistEntryRow, 'id' | 'status'>
    ) => void;
  } = {}
) {
  return render(
    <TooltipProvider>
      <ColumnsHarness entry={entry} {...options} />
    </TooltipProvider>
  );
}

describe('useWaitlistColumns', () => {
  it('renders identity, social, spotify, and status cells', () => {
    renderColumns(makeEntry());

    expect(screen.getByTestId('cell-name')).toHaveTextContent('Ari Lane');
    expect(screen.getByText('ari@example.com')).toHaveAttribute(
      'href',
      'mailto:ari@example.com'
    );
    expect(screen.getByTestId('cell-primaryGoal')).toHaveTextContent('Streams');
    expect(screen.getByTestId('cell-primarySocial')).toHaveTextContent(
      'Instagram'
    );
    expect(screen.getByTestId('spotify-account-identity')).toHaveTextContent(
      'Ari Lane'
    );
    expect(screen.getByTestId('cell-status')).toHaveTextContent('new');
  });

  it('renders empty markers when optional fields are missing', () => {
    renderColumns(
      makeEntry({
        primaryGoal: null,
        spotifyUrlNormalized: null,
        heardAbout: null,
      })
    );

    expect(screen.getByTestId('cell-primaryGoal')).toHaveTextContent('—');
    expect(screen.getByTestId('cell-spotify')).toHaveTextContent('—');
    expect(screen.getByTestId('cell-heardAbout')).toHaveTextContent('—');
  });

  it('truncates long heard-about answers behind a tooltip', () => {
    renderColumns(
      makeEntry({ heardAbout: 'A very long answer that keeps on going' })
    );

    expect(screen.getByTestId('cell-heardAbout')).toHaveTextContent(
      'A very long answer that keeps …'
    );
  });

  it('dispatches onApprove with the entry id and status', () => {
    const onApprove = vi.fn();
    renderColumns(makeEntry(), { onApprove });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wl_1', status: 'new' })
    );
  });

  it('shows in-flight and terminal action labels', () => {
    renderColumns(makeEntry({ status: 'signed_up' }));
    expect(screen.getByRole('button', { name: 'Signed up' })).toBeDisabled();
  });
});
