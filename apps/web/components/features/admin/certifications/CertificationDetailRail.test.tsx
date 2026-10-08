import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureInventory,
  fixturePacket,
  fixtureReceipt,
  fixtureRow,
} from '@/lib/ovie/certifications/fixtures';
import { CertificationDetailRail } from './CertificationDetailRail';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

const onDecide = vi.fn();
const onClose = vi.fn();

function renderRail(
  props: Partial<Parameters<typeof CertificationDetailRail>[0]> = {}
) {
  const ui: ReactNode = (
    <CertificationDetailRail
      row={fixtureRow('signup')}
      onClose={onClose}
      onDecide={onDecide}
      pendingDecision={null}
      decisionError={null}
      {...props}
    />
  );
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('CertificationDetailRail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onDecide.mockResolvedValue(undefined);
  });

  it('shows an empty rail when nothing is selected', () => {
    renderRail({ row: null });
    expect(
      screen.getByText('Select a certification to review its evidence.')
    ).toBeInTheDocument();
  });

  it('opens with the entity header, evidence links, history, and source', () => {
    renderRail();
    expect(screen.getByTestId('entity-header-title')).toHaveTextContent(
      'Flow signup'
    );
    expect(screen.getByTestId('entity-header-details-row')).toHaveTextContent(
      'Flows · Golden Path'
    );
    const evidence = screen.getByTestId('certification-evidence');
    const run = within(evidence).getByRole('link', {
      name: /actions\/runs\/1/,
    });
    expect(run).toHaveAttribute(
      'href',
      'https://github.com/JovieInc/Jovie/actions/runs/1'
    );
    expect(run).toHaveAttribute('target', '_blank');
    expect(
      within(screen.getByTestId('certification-links')).getByRole('link', {
        name: /Dogfood transcript/,
      })
    ).toHaveAttribute('href', 'https://example.test/transcript');
    expect(screen.getByTestId('certification-history')).toBeInTheDocument();
    expect(screen.getByText('JovieInc/Jovie@abcdef0')).toBeInTheDocument();
    expect(screen.queryByTestId('certification-blockers')).toBeNull();
  });

  it('opens an existing public proof ref from the evidence list', () => {
    const row = fixtureRow('contact-page');
    const ref = '/product-screenshots/tim-white-profile-contact-phone.png';
    renderRail({
      row: { ...row, evidence: [{ ...row.evidence[0], href: null, ref }] },
    });
    expect(screen.getByRole('link', { name: ref })).toHaveAttribute(
      'href',
      ref
    );
  });

  it('keeps history and source available behind collapsed sections', () => {
    renderRail();
    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('certifies in one activation and requires a note to request changes', () => {
    renderRail();
    fireEvent.click(screen.getByRole('button', { name: 'Certify' }));
    expect(onDecide).toHaveBeenCalledWith('approved', null);

    const requestChanges = screen.getByRole('button', {
      name: 'Request Changes',
    });
    expect(requestChanges).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Note for the worker'), {
      target: { value: '  Fix the empty state  ' },
    });
    expect(requestChanges).toBeEnabled();
    fireEvent.click(requestChanges);
    expect(onDecide).toHaveBeenLastCalledWith(
      'changes_requested',
      'Fix the empty state'
    );
  });

  it('confirms before rejecting', async () => {
    renderRail();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onDecide).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await vi.waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith('rejected', null)
    );
  });

  it('keeps a stable status slot and shows the server reason on failure', () => {
    renderRail({
      decisionError: 'The evidence changed since this page loaded.',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'The evidence changed since this page loaded.'
    );
  });

  it('launches the walkthrough only when a decision can land', () => {
    const onWalkthrough = vi.fn();
    renderRail({ onWalkthrough });
    fireEvent.click(screen.getByTestId('certification-walkthrough-action'));
    expect(onWalkthrough).toHaveBeenCalledTimes(1);
  });

  it('hides the walkthrough action for items that cannot be decided', () => {
    renderRail({
      onWalkthrough: vi.fn(),
      row: fixtureRow('claim', {
        packet: fixturePacket('claim', {
          visualProof: [fixtureReceipt('visual_proof', 'v', 'failed')],
        }),
      }),
    });
    expect(screen.queryByTestId('certification-walkthrough-action')).toBeNull();
  });

  it('locks actions while a decision is pending', () => {
    renderRail({ pendingDecision: 'approved' });
    expect(screen.getByRole('button', { name: /Certify/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('explains why a working item cannot be decided and lists its blockers', () => {
    renderRail({
      row: fixtureRow('claim', {
        packet: fixturePacket('claim', {
          visualProof: [fixtureReceipt('visual_proof', 'v', 'failed')],
        }),
      }),
    });
    expect(
      screen.getByTestId('certification-decision-unavailable')
    ).toHaveTextContent(/Evidence is incomplete/);
    expect(screen.queryByRole('button', { name: 'Certify' })).toBeNull();
    expect(screen.getByTestId('certification-blockers')).toBeInTheDocument();
  });

  it('shows a certified row without actions', () => {
    const certified = fixtureInventory().rows[2];
    renderRail({ row: certified ?? null });
    expect(
      screen.getByTestId('certification-decision-unavailable')
    ).toHaveTextContent('A founder decision already exists for this evidence.');
    expect(screen.getByRole('img', { name: 'Certified' })).toBeInTheDocument();
  });
});
