import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationInventory } from '@/lib/ovie/certifications/types';
import { CertificationJudgments } from './CertificationJudgments';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/queries/useOvieCertificationsQuery', () => ({
  useOvieCertificationsQuery: mocks.query,
  useOvieCertificationDecisionMutation: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
  getCertificationDecisionErrorMessage: () => 'The evidence changed.',
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

interface QueryState {
  readonly data?: OvieCertificationInventory;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
  readonly error?: unknown;
}

function mockQuery(state: QueryState) {
  mocks.query.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: mocks.refetch,
    ...state,
  });
}

describe('CertificationJudgments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateAsync.mockResolvedValue({ row: null });
  });

  it('renders nothing extra when coverage exists and no judgment is pending', () => {
    const inventory = fixtureInventory();
    mockQuery({
      data: {
        ...inventory,
        queue: { ...inventory.queue, needsYou: [] },
      },
    });
    const { container } = render(<CertificationJudgments />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the pending judgment with its evidence link and choices', () => {
    mockQuery({ data: fixtureInventory() });
    render(<CertificationJudgments />);

    const card = screen.getByTestId('needs-you-judgment-signup-golden-path');
    expect(card).toHaveTextContent('Flow signup-golden-path');
    expect(card).toHaveTextContent('Flows · Golden Path');
    expect(
      screen.getByRole('link', { name: /Flow signup-golden-path/ })
    ).toHaveAttribute(
      'href',
      '/app/ov/certifications?row=flows%3Asignup-golden-path'
    );
    expect(
      screen.getByRole('button', {
        name: 'Certify "Flow signup-golden-path"',
      })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Request changes "Flow signup-golden-path"',
      })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Reject "Flow signup-golden-path"',
      })
    ).toBeEnabled();
  });

  it('records an approval against the kernel evidence digest', async () => {
    const inventory = fixtureInventory();
    mockQuery({ data: inventory });
    render(<CertificationJudgments />);

    const row = inventory.rows.find(r => r.id === 'flows:signup-golden-path');
    expect(row?.decision.evidenceDigest).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Certify "Flow signup-golden-path"' })
    );

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        rowId: 'flows:signup-golden-path',
        evidenceDigest: row?.decision.evidenceDigest,
        decision: 'approved',
        notes: null,
        actionId: expect.any(String),
      });
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Certified');
  });

  it('requires a note before requesting changes', async () => {
    mockQuery({ data: fixtureInventory() });
    render(<CertificationJudgments />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Request changes "Flow signup-golden-path"',
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Request changes' })
    );

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Add a note so the worker knows what to change.'
    );

    fireEvent.change(screen.getByPlaceholderText(/What should change/), {
      target: { value: ' tighten the hero copy ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Request changes' })
    );

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'changes_requested',
          notes: 'tighten the hero copy',
        })
      );
    });
  });

  it('shows the server message and refetches when a decision is rejected', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('boom'));
    mockQuery({ data: fixtureInventory() });
    render(<CertificationJudgments />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Certify "Flow signup-golden-path"' })
    );

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('The evidence changed.');
    });
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('renders an unavailable state with retry when the inventory fails', () => {
    mockQuery({ isError: true, error: new Error('down') });
    render(<CertificationJudgments />);

    expect(
      screen.getByText('Certification judgments could not be loaded.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it('states partial coverage instead of a healthy empty when nothing is connected', () => {
    const inventory = fixtureInventory();
    mockQuery({
      data: {
        ...inventory,
        domains: inventory.domains.map(domain => ({
          ...domain,
          status: 'not_connected' as const,
          rowCount: 0,
        })),
        queue: { ...inventory.queue, needsYou: [] },
        rows: [],
      },
    });
    render(<CertificationJudgments />);

    expect(
      screen.getByText(/No certification domains are connected yet/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs you.')).toBeNull();
  });

  it('shows the blocked reason instead of actions when the kernel refuses decisions', () => {
    const inventory = fixtureInventory();
    const gated = {
      ...inventory,
      rows: inventory.rows.map(row =>
        row.id === 'flows:signup-golden-path'
          ? {
              ...row,
              decision: {
                available: false,
                reason: 'Only review-ready items take a founder decision.',
                evidenceDigest: row.decision.evidenceDigest,
              },
            }
          : row
      ),
    };
    mockQuery({ data: gated });
    render(<CertificationJudgments />);

    expect(
      screen.getByText('Only review-ready items take a founder decision.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Certify "Flow signup-golden-path"',
      })
    ).toBeNull();
  });
});
