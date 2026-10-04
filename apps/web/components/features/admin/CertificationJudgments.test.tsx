import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

  it('keeps each judgment disabled until its own concurrent submission finishes', async () => {
    const inventory = fixtureInventory();
    const flow = inventory.rows.find(
      row => row.id === 'flows:signup-golden-path'
    );
    const judgment = inventory.queue.needsYou.find(
      item => item.domain === 'flows'
    );
    if (!flow || !judgment) throw new Error('Expected the flow fixture');
    const second = {
      ...flow,
      id: 'flows:second',
      subject: { ...flow.subject, id: 'second', title: 'Second flow' },
    };
    mockQuery({
      data: {
        ...inventory,
        rows: [flow, second],
        queue: {
          ...inventory.queue,
          needsYou: [judgment, { ...judgment, subject: second.subject }],
        },
      },
    });
    const firstRequest = Promise.withResolvers<void>();
    const secondRequest = Promise.withResolvers<void>();
    mocks.mutateAsync
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    render(<CertificationJudgments />);
    const first = screen.getByRole('button', {
      name: 'Certify "Flow signup-golden-path"',
    });
    const other = screen.getByRole('button', { name: 'Certify "Second flow"' });
    fireEvent.click(first);
    fireEvent.click(other);
    expect(first).toBeDisabled();
    expect(other).toBeDisabled();
    fireEvent.click(first);
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(2);
    await act(async () => firstRequest.resolve());
    expect(first).toBeEnabled();
    expect(other).toBeDisabled();
    fireEvent.click(other);
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(2);
    await act(async () => secondRequest.resolve());
    expect(other).toBeEnabled();
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

  it('binds decisions to the matching domain when subject IDs collide', async () => {
    const inventory = fixtureInventory();
    const flow = inventory.rows.find(
      row => row.id === 'flows:signup-golden-path'
    );
    const judgment = inventory.queue.needsYou.find(
      item => item.domain === 'flows'
    );
    if (!flow || !judgment) throw new Error('Expected the flow fixture');
    const profile = {
      ...flow,
      id: 'public_profiles:signup-golden-path',
      domain: 'public_profiles' as const,
      subject: { ...flow.subject, title: 'Profile signup-golden-path' },
      decision: { ...flow.decision, evidenceDigest: 'profile-evidence' },
    };
    mockQuery({
      data: {
        ...inventory,
        rows: [...inventory.rows, profile],
        queue: {
          ...inventory.queue,
          needsYou: [
            ...inventory.queue.needsYou,
            {
              ...judgment,
              domain: 'public_profiles',
              subject: profile.subject,
              decisionEvidenceDigest: 'profile-evidence',
            },
          ],
        },
      },
    });
    render(<CertificationJudgments />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Certify "Flow signup-golden-path"' })
    );
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          rowId: flow.id,
          evidenceDigest: flow.decision.evidenceDigest,
        })
      )
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Certify "Profile signup-golden-path"',
      })
    );
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({
          rowId: profile.id,
          evidenceDigest: 'profile-evidence',
        })
      )
    );
  });

  it('does not attach a change-request draft note to an approval', async () => {
    mockQuery({ data: fixtureInventory() });
    render(<CertificationJudgments />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Request changes "Flow signup-golden-path"',
      })
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Note for Request changes' }),
      {
        target: { value: 'This note belongs to a request for changes' },
      }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Certify "Flow signup-golden-path"' })
    );
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'approved', notes: null })
      )
    );
  });

  it('offers recovery for an unexpected inventory contract instead of claiming no coverage', () => {
    mockQuery({
      data: {
        ...fixtureInventory(),
        contract: 'unexpected',
      } as unknown as OvieCertificationInventory,
    });
    render(<CertificationJudgments />);
    expect(
      screen.getByText('Certification judgments could not be loaded.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No certification domains are connected/)
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
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

  it('keeps the change-request note through a failed write and clears it after retry succeeds', async () => {
    let rejectDecision: (error: Error) => void = () => undefined;
    const pendingDecision = new Promise<void>((_, reject) => {
      rejectDecision = reject;
    });
    mocks.mutateAsync
      .mockReturnValueOnce(pendingDecision)
      .mockResolvedValueOnce(undefined);
    mockQuery({ data: fixtureInventory() });
    render(<CertificationJudgments />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Request changes "Flow signup-golden-path"',
      })
    );
    const note = screen.getByRole('textbox', {
      name: 'Note for Request changes',
    });
    fireEvent.change(note, {
      target: { value: 'Keep the recovery action visible' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Request changes' })
    );
    expect(note).toHaveValue('Keep the recovery action visible');
    expect(note).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    rejectDecision(new Error('temporarily unavailable'));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(note).toHaveValue('Keep the recovery action visible');
    expect(note).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm Request changes' })
    );
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Changes requested')
    );
    expect(mocks.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ notes: 'Keep the recovery action visible' })
    );
    expect(
      screen.queryByRole('textbox', { name: 'Note for Request changes' })
    ).toBeNull();
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
