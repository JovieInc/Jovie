import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeLoopAsk } from '@/lib/home-loop/contract';
import { HomeLoopAsks } from './HomeLoopAsks';

const reviewAsk = (overrides: Partial<HomeLoopAsk> = {}): HomeLoopAsk => ({
  id: 'certification:marketing_components:hero',
  title: 'Hero',
  recommendation: 'Review the evidence and certify or request changes.',
  why: 'Marketing hero',
  decidable: true,
  actionLabel: 'Certify',
  canReply: true,
  evidence: [],
  requiresEvidence: true,
  evidenceSummary: null,
  decisionDefault: null,
  canFeedback: false,
  ...overrides,
});

function renderAsks(ask: HomeLoopAsk) {
  const onApprove = vi.fn();
  render(
    <HomeLoopAsks
      asks={[ask]}
      answers={{}}
      onApprove={onApprove}
      onReply={vi.fn()}
    />
  );
  return { onApprove, card: screen.getByTestId('home-loop-ask') };
}

describe('HomeLoopAsks review evidence', () => {
  it('says evidence is missing and disables Certify when nothing is attached', () => {
    const { onApprove, card } = renderAsks(reviewAsk());
    expect(
      within(card).getByTestId('home-loop-ask-evidence-missing')
    ).toHaveTextContent('Evidence missing');
    const certify = within(card).getByRole('button', { name: 'Certify' });
    expect(certify).toBeDisabled();
    fireEvent.click(certify);
    expect(onApprove).not.toHaveBeenCalled();
    // Requesting changes stays available.
    expect(
      within(card).getByRole('textbox', { name: 'Reply: Hero' })
    ).toBeEnabled();
  });

  it('disables one-click options too when evidence is missing', () => {
    const { card } = renderAsks(reviewAsk({ options: ['Ship', 'Hold'] }));
    for (const name of ['Ship', 'Hold'])
      expect(within(card).getByRole('button', { name })).toBeDisabled();
  });

  it('shows the evidence summary and links inline next to an enabled action', () => {
    const { onApprove, card } = renderAsks(
      reviewAsk({
        evidence: ['https://example.test/a', 'https://example.test/b'],
        evidenceSummary: 'unit pass · visual pass',
      })
    );
    const line = within(card).getByTestId('home-loop-ask-evidence');
    expect(line).toBeVisible();
    expect(line).toHaveTextContent('unit pass · visual pass');
    expect(
      within(line).getByRole('link', { name: 'Evidence 1' })
    ).toHaveAttribute('href', 'https://example.test/a');
    expect(
      within(card).queryByTestId('home-loop-ask-evidence-missing')
    ).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Certify' }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('counts a summary without links as evidence', () => {
    const { card } = renderAsks(
      reviewAsk({ evidenceSummary: 'unit pass · e2e missing' })
    );
    expect(within(card).getByRole('button', { name: 'Certify' })).toBeEnabled();
  });

  it('keeps standalone Why explanations inline', () => {
    renderAsks(reviewAsk());
    const why = screen.getByText('Marketing hero');
    expect(why).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Why' }));
    expect(why).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves non-review asks unchanged', () => {
    const { card } = renderAsks(
      reviewAsk({ requiresEvidence: false, actionLabel: 'Approve' })
    );
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(within(card).queryByTestId('home-loop-ask-evidence')).toBeNull();
    expect(
      within(card).queryByTestId('home-loop-ask-evidence-missing')
    ).toBeNull();
  });
});
