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
  it('omits empty certification and message sections while keeping unknown state and sources inline', () => {
    renderRail({
      row: outboundFixtureRow({ message: null }),
      certification: null,
    });
    expect(
      screen.queryByRole('button', { name: 'Certification details' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Message', { exact: true })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Source', exact: true })
    ).toBeVisible();
    expect(screen.getByTestId('outbound-readiness')).toHaveTextContent(
      'Current certification is unknown.'
    );
  });

  it('focuses the current message for review without approving it', () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole('button', { name: 'Review Message' }));
    expect(screen.getByLabelText('Message Body')).toHaveFocus();
    expect(props.onApprove).not.toHaveBeenCalled();
  });
  it('focuses the active fact rather than an earlier fact when review is requested', () => {
    const facts = ['First', 'Active'].map((label, index) => ({
      key: `fact-${index}`,
      revision: 'synthetic',
      category: 'identity' as const,
      label,
      value: label,
      url: null,
      source: 'fixture',
      observedAt: null,
      confidence: null,
      rationale: 'Synthetic evidence',
      freshness: 'unknown' as const,
      decision: null,
    }));
    renderRail({
      certification: {
        ...certification('needs_review'),
        items: facts,
        coverage: {
          ...certification('needs_review').coverage,
          missingSourceClasses: [],
        },
      },
      activeFactKey: 'fact-1',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review Facts' }));
    expect(
      within(screen.getByRole('group', { name: 'Review Active' })).getByRole(
        'button',
        { name: 'Yes' }
      )
    ).toHaveFocus();
  });

  it('resets local edits, open details and rejection confirmation when the person changes', () => {
    const props: OutboundRailProps = {
      row: outboundFixtureRow(),
      certification: certification('certified_for_outreach'),
      certificationLoading: false,
      activeFactKey: null,
      pending: null,
      error: null,
      onClose: vi.fn(),
      onFact: vi.fn(),
      onCertify: vi.fn(),
      onRefreshEvidence: vi.fn(),
      onApprove: vi.fn(),
      onSaveCopy: vi.fn(),
      onHold: vi.fn(),
      onReject: vi.fn(),
    };
    const { rerender } = render(
      <TooltipProvider>
        <OutboundRail {...props} />
      </TooltipProvider>
    );
    fireEvent.change(screen.getByLabelText('Message Body'), {
      target: { value: 'Unsaved Ada edit' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Certification details' })
    );
    act(() => sendOutboundRailCommand('reject'));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    const next = outboundFixtureRow({
      leadId: 'synthetic-next-person',
      name: 'Bea',
      message: {
        channel: 'email',
        subject: 'Bea subject',
        body: 'Bea draft',
        revision: null,
      },
    });
    rerender(
      <TooltipProvider>
        <OutboundRail {...props} row={next} />
      </TooltipProvider>
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message Body')).toHaveValue('Bea draft');
    expect(
      screen.getByRole('button', { name: 'Certification details' })
    ).toHaveAttribute('aria-expanded', 'false');
    act(() => sendOutboundRailCommand('approve'));
    expect(props.onApprove).toHaveBeenLastCalledWith({
      channel: 'email',
      subject: 'Bea subject',
      body: 'Bea draft',
    });
  });

  it('keeps readiness blockers and a truthful next action above closed details', () => {
    renderRail({ certification: certification('needs_review') });
    const summary = screen.getByTestId('outbound-readiness');
    expect(summary).toHaveTextContent('2 unresolved facts');
    expect(summary).toHaveTextContent('dsp');
    expect(summary).toHaveTextContent('Sending remains closed');
    expect(
      within(summary).getByRole('button', { name: 'Refresh Evidence' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Certification details' })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows judge and reachability blockers together without inventing a dispatch action', () => {
    renderRail({
      row: outboundFixtureRow({
        view: 'needs_judge',
        channel: null,
        message: null,
      }),
    });
    const summary = screen.getByTestId('outbound-readiness');
    expect(summary).toHaveTextContent('dogfood judge');
    expect(summary).toHaveTextContent('No reachable channel');
    expect(
      within(summary).getByRole('link', { name: 'Review Source' })
    ).toHaveAttribute('href', 'https://linktr.ee/ada');
    expect(
      screen.queryByRole('button', { name: /Build|Gather/ })
    ).not.toBeInTheDocument();
  });

  it('explains unavailable cold draft facts or compliance without offering message actions', () => {
    renderRail({
      row: outboundFixtureRow({
        view: 'flagged',
        flags: ['cold_draft_unavailable'],
        message: null,
      }),
    });
    expect(screen.getByTestId('outbound-message-empty')).toHaveTextContent(
      'certified page facts and email compliance'
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('explains a judge-blocked draft without offering message actions', () => {
    const props = renderRail({
      row: outboundFixtureRow({
        view: 'needs_judge',
        nextAction: 'await_judge',
        message: null,
      }),
    });
    expect(screen.getByTestId('outbound-message-empty')).toHaveTextContent(
      'Draft hidden until the page and onboarding pass the dogfood judge.'
    );
    expect(screen.queryByLabelText('Message Body')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument();
    act(() => sendOutboundRailCommand('approve'));
    expect(props.onApprove).not.toHaveBeenCalled();
  });

  it('blocks approval and says so when no recipient is on file (A17)', () => {
    renderRail({ row: outboundFixtureRow({ channel: null }) });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByText('No reachable channel.')).toBeInTheDocument();
  });

  it('explains an unreachable lead with no draft', () => {
    renderRail({ row: outboundFixtureRow({ channel: null, message: null }) });
    expect(screen.getByTestId('outbound-message-empty')).toHaveTextContent(
      'No reachable channel'
    );
  });

  it('lists missing evidence and the non-artist flag', () => {
    renderRail({
      row: outboundFixtureRow({
        view: 'flagged',
        flags: ['possible_non_artist'],
        entityNote: 'Looks like a label or distributor',
        missingEvidence: ['dsp', 'search'],
      }),
    });
    const box = screen.getByTestId('outbound-eligibility');
    expect(box).toHaveTextContent('Looks like a label or distributor');
    expect(box).toHaveTextContent('Needs evidence: dsp, search.');
  });

  it('blocks approval until the current facts are certified', () => {
    const props = renderRail({ certification: certification('needs_review') });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByText('Certify facts to approve.')).toBeInTheDocument();
    expect(
      screen
        .getByTestId('outbound-rail')
        .querySelector('[data-surface-variant="flat"]')
    ).not.toBeNull();
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
    const dialog = await screen.findByRole('alertdialog');
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

  it('offers a refresh while evidence is missing on a built profile', () => {
    const props = renderRail({ certification: certification('needs_review') });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Evidence' }));
    expect(props.onRefreshEvidence).toHaveBeenCalledOnce();
  });
});
