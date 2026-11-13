import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import {
  OutboundRailReadiness,
  type OutboundRailReadinessProps,
} from './OutboundRailReadiness';
import { outboundFixtureRow } from './outbound-fixtures';

const certified: ContactCertificationInspection = {
  evidenceRevision: 'synthetic',
  status: 'certified_for_outreach',
  canCertify: true,
  items: [
    {
      key: 'synthetic-fact',
      revision: 'synthetic',
      category: 'identity',
      label: 'Identity',
      value: 'Ada',
      source: 'fixture',
      url: null,
      observedAt: null,
      confidence: null,
      freshness: 'unknown',
      rationale: 'Synthetic evidence',
      decision: null,
    },
  ],
  coverage: {
    confirmed: 1,
    rejected: 0,
    unresolved: 0,
    stale: 0,
    sourceClassesChecked: ['identity'],
    missingSourceClasses: [],
  },
};
function setup(overrides: Partial<OutboundRailReadinessProps> = {}) {
  const props = {
    row: outboundFixtureRow(),
    certification: certified,
    loading: false,
    pending: null,
    onRefreshEvidence: vi.fn(),
    onCertify: vi.fn(),
    onReviewFacts: vi.fn(),
    onReviewMessage: vi.fn(),
    ...overrides,
  };
  render(<OutboundRailReadiness {...props} />);
  return props;
}
describe('OutboundRailReadiness', () => {
  it('keeps an action refusal in the readiness summary rather than claiming all clear', () => {
    setup({ error: 'Approval refused: facts changed since certification.' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'facts changed since certification'
    );
    expect(
      screen.queryByText(
        'Current facts are certified. Review the draft before approving.'
      )
    ).not.toBeInTheDocument();
  });
  it.each([
    ['sent', 'Delivery is not confirmed here'],
    ['replied', 'Signup is not recorded'],
    ['claimed', 'Payment is not recorded'],
    ['paid', 'Payment recorded'],
  ] as const)(
    'keeps %s lifecycle distinct from draft approval',
    (view, text) => {
      setup({ row: outboundFixtureRow({ view }) });
      expect(screen.getByTestId('outbound-readiness')).toHaveTextContent(text);
      expect(
        screen.getByRole('link', { name: 'Review Profile' })
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Review Message' })
      ).not.toBeInTheDocument();
    }
  );
  it('uses queue missing evidence when the certification snapshot disagrees', () => {
    const props = setup({
      row: outboundFixtureRow({ missingEvidence: ['catalog'] }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Evidence' }));
    expect(props.onRefreshEvidence).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: 'Review Message' })
    ).not.toBeInTheDocument();
  });
  it('reviews the source when no facts exist, without a no-op fact action', () => {
    setup({
      certification: {
        ...certified,
        status: 'machine_scanning',
        canCertify: false,
        items: [],
      },
    });
    expect(screen.getByRole('link', { name: 'Review Source' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Review Facts' })
    ).not.toBeInTheDocument();
  });
  it.each(['held', 'rejected'] as const)(
    'preserves the %s lifecycle even without an approval record',
    view => {
      setup({ row: outboundFixtureRow({ view }) });
      expect(screen.getByTestId('outbound-readiness')).toHaveTextContent(
        view === 'held' ? 'on hold' : 'Rejected'
      );
      expect(
        screen.getByRole('button', { name: 'Review Facts' })
      ).toBeVisible();
      expect(
        screen.queryByText(
          'Current facts are certified. Review the draft before approving.'
        )
      ).not.toBeInTheDocument();
    }
  );
  it.each([
    ['stale', 'Certification is stale'],
    ['conflicted', 'Resolve conflicting facts'],
    ['needs_review', 'Current facts need certification'],
  ] as const)(
    'keeps %s certification visible beside the next action',
    (status, text) => {
      const props = setup({
        certification: { ...certified, status, canCertify: false },
      });
      expect(screen.getByTestId('outbound-readiness')).toHaveTextContent(text);
      fireEvent.click(screen.getByRole('button', { name: 'Review Facts' }));
      expect(props.onReviewFacts).toHaveBeenCalledOnce();
    }
  );
  it('never turns unknown certification into ready or a certify action', () => {
    setup({ certification: null });
    expect(screen.getByText('Current certification is unknown.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Review Source' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Certify Current Facts' })
    ).not.toBeInTheDocument();
  });
  it('shows loading and missing profile without pretending to build it', () => {
    setup({
      loading: true,
      certification: null,
      row: outboundFixtureRow({ profilePath: null, message: null }),
    });
    expect(screen.getByText('Current facts are loading.')).toBeVisible();
    expect(screen.getByText('No Jovie profile has been built.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Review Source' })).toBeVisible();
  });
  it('keeps rejection reason and missing evidence visible even when certification is present', () => {
    const row = outboundFixtureRow();
    setup({
      row: {
        ...row,
        approval: {
          ...row.approval,
          target: 'rejected',
          rejectReason: 'wrong_person',
        },
        missingEvidence: ['catalog'],
      },
    });
    expect(screen.getByText('Rejected: Wrong person.')).toBeVisible();
    expect(screen.getByText('Needs evidence: catalog.')).toBeVisible();
  });
  it('exposes stale approval, a hold, and stale or rejected facts', () => {
    const row = outboundFixtureRow();
    setup({
      row: {
        ...row,
        approval: { ...row.approval, target: 'held', copy: 'stale' },
      },
      certification: {
        ...certified,
        coverage: { ...certified.coverage, rejected: 1, stale: 2 },
      },
    });
    expect(screen.getByText('This person is on hold.')).toBeVisible();
    expect(screen.getByText(/Approval is stale/)).toBeVisible();
    expect(screen.getByText(/2 stale facts · 1 rejected fact/)).toBeVisible();
  });
  it('only certifies through the existing callback when certification permits it', () => {
    const props = setup({
      certification: { ...certified, status: 'human_reviewed' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Certify Current Facts' })
    );
    expect(props.onCertify).toHaveBeenCalledOnce();
  });
  it('reviews a certified message without approving or sending it', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Review Message' }));
    expect(props.onReviewMessage).toHaveBeenCalledOnce();
    expect(screen.getByText(/Sending remains closed/)).toBeVisible();
  });
  it('offers profile review for missing compliance inputs and keeps the reason visible', () => {
    setup({
      row: outboundFixtureRow({
        flags: ['cold_draft_unavailable'],
        message: null,
      }),
    });
    expect(
      screen.getByText(/email compliance checks are missing/)
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Review Profile' })
    ).toHaveAttribute('href', '/ada');
  });
});
