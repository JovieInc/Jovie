import { TooltipProvider } from '@jovie/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import { OutboundRail, type OutboundRailProps } from './OutboundRail';
import { outboundFixtureRow } from './outbound-fixtures';
import { sendOutboundRailCommand } from './outbound-keys';

function certification(
  status: ContactCertificationInspection['status']
): ContactCertificationInspection {
  return {
    evidenceRevision: 'rev',
    status,
    canCertify: status !== 'needs_review',
    coverage: {
      confirmed: 3,
      rejected: 0,
      unresolved: status === 'needs_review' ? 2 : 0,
      stale: 0,
      sourceClassesChecked: ['identity'],
      missingSourceClasses: status === 'needs_review' ? ['dsp'] : [],
    },
    items: [],
  };
}

function renderRail(overrides: Partial<OutboundRailProps> = {}) {
  const props: OutboundRailProps = {
    row: outboundFixtureRow(),
    certification: certification('certified_for_outreach'),
    certificationLoading: false,
    activeFactKey: null,
    pending: null,
    error: null,
    onClose: vi.fn(),
    onFact: vi.fn(async () => {}),
    onCertify: vi.fn(),
    onRefreshEvidence: vi.fn(),
    onApprove: vi.fn(),
    onSaveCopy: vi.fn(),
    onHold: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
  render(
    <TooltipProvider>
      <OutboundRail {...props} />
    </TooltipProvider>
  );
  return props;
}

describe('OutboundRail', () => {
  it('blocks approval until the current facts are certified', () => {
    const props = renderRail({ certification: certification('needs_review') });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByText('Certify facts to approve.')).toBeInTheDocument();
    act(() => sendOutboundRailCommand('approve'));
    expect(props.onApprove).not.toHaveBeenCalled();
  });

  it('approves exactly the text Tim is looking at, including edits', () => {
    const props = renderRail();
    fireEvent.change(screen.getByLabelText('Message Body'), {
      target: { value: 'Edited: https://jov.ie/claim/tok' },
    });
    expect(screen.getByText('Edited · needs approval')).toBeInTheDocument();
    act(() => sendOutboundRailCommand('approve'));
    expect(props.onApprove).toHaveBeenCalledWith({
      channel: 'email',
      subject: 'Your Jovie page is ready',
      body: 'Edited: https://jov.ie/claim/tok',
    });
  });

  it('saves an edit as an unapproved draft', () => {
    const props = renderRail();
    const save = screen.getByRole('button', { name: 'Save Draft' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'New subject' },
    });
    fireEvent.click(save);
    expect(props.onSaveCopy).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'New subject' })
    );
  });

  it('confirms before rejecting, then records the chosen reason', async () => {
    const props = renderRail();
    act(() => sendOutboundRailCommand('reject'));
    expect(props.onReject).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(props.onReject).toHaveBeenCalledWith('not_a_fit');
  });

  it('asks to resolve a conflict before approving', () => {
    renderRail({ certification: certification('conflicted') });
    expect(
      screen.getByText('Resolve the conflict to approve.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('says when there is no way to reach someone', () => {
    renderRail({
      row: outboundFixtureRow({ channel: null, message: null }),
    });
    expect(
      screen.getByText(
        'No email or Instagram on file, so there is no way to reach them.'
      )
    ).toBeInTheDocument();
  });

  it('offers a refresh while evidence is missing on a built profile', () => {
    const props = renderRail({ certification: certification('needs_review') });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Evidence' }));
    expect(props.onRefreshEvidence).toHaveBeenCalledOnce();
  });
});
