import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OUTBOUND_REJECT_REASONS } from '@/lib/outbound/types';
import { OutboundReviewDeck, reviewableRows } from './OutboundReviewDeck';
import { outboundFixtureRow } from './outbound-fixtures';

const ADA = outboundFixtureRow({
  view: 'certified',
  nextAction: 'approve_message',
  certified: true,
});
const BEA = outboundFixtureRow({
  leadId: '00000000-0000-4000-8000-000000000002',
  name: 'Bea',
  handle: 'bea',
  view: 'certified',
  nextAction: 'approve_message',
  certified: true,
});
const NOT_READY = outboundFixtureRow({
  leadId: '00000000-0000-4000-8000-000000000003',
  view: 'ready',
  nextAction: 'review_facts',
});

function setup(rows = [ADA, BEA, NOT_READY]) {
  const props = {
    rows,
    engine: undefined,
    pending: null,
    error: null,
    onApprove: vi.fn(async () => {}),
    onReject: vi.fn(async () => {}),
    onExit: vi.fn(),
  };
  render(<OutboundReviewDeck {...props} />);
  return props;
}

const key = (k: string) => fireEvent.keyDown(window, { key: k });

describe('OutboundReviewDeck', () => {
  it('only deals certified rows with a message', () => {
    expect(reviewableRows([ADA, BEA, NOT_READY]).map(r => r.name)).toEqual([
      'Ada',
      'Bea',
    ]);
    setup();
    expect(screen.getByTestId('outbound-review-progress')).toHaveTextContent(
      '1 of 2'
    );
  });

  it('approves the exact text shown with a', () => {
    const props = setup();
    key('a');
    expect(props.onApprove).toHaveBeenCalledWith(ADA, {
      channel: 'email',
      subject: ADA.message?.subject,
      body: ADA.message?.body,
    });
  });

  it('approves the edited text after e', () => {
    const props = setup();
    key('e');
    fireEvent.change(screen.getByLabelText('Message Body'), {
      target: {
        value: 'Hey,\n\nMade you a page: https://jov.ie/claim/tok\n\nTim',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve edit' }));
    expect(props.onApprove).toHaveBeenCalledWith(
      ADA,
      expect.objectContaining({
        body: 'Hey,\n\nMade you a page: https://jov.ie/claim/tok\n\nTim',
      })
    );
  });

  it('rejects with a numbered reason chip after r', () => {
    const props = setup();
    key('r');
    expect(
      screen.getByRole('group', { name: 'Reject Reason' })
    ).toBeInTheDocument();
    key('2');
    expect(props.onReject).toHaveBeenCalledWith(
      ADA,
      OUTBOUND_REJECT_REASONS[1]
    );
  });

  it('skips and goes back without deciding', () => {
    const props = setup();
    key('s');
    expect(screen.getByTestId('outbound-review-progress')).toHaveTextContent(
      '2 of 2'
    );
    expect(screen.getByRole('heading', { name: 'Bea' })).toBeInTheDocument();
    key('ArrowLeft');
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeInTheDocument();
    expect(props.onApprove).not.toHaveBeenCalled();
    expect(props.onReject).not.toHaveBeenCalled();
  });

  it('shows the follow-ups and exits on escape', () => {
    const props = setup();
    expect(screen.getByText(/2 follow-ups/)).toBeInTheDocument();
    key('Escape');
    expect(props.onExit).toHaveBeenCalled();
  });

  it('says so when nothing is left to review', () => {
    setup([NOT_READY]);
    expect(screen.getByText('Nothing To Review')).toBeInTheDocument();
  });
});
