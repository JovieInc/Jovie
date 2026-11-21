import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundRailReadiness } from './OutboundRailReadiness';
import { outboundFixtureRow } from './outbound-fixtures';

const certified: ContactCertificationInspection = {
  evidenceRevision: 'synthetic',
  status: 'certified_for_outreach',
  canCertify: true,
  items: [],
  coverage: {
    confirmed: 1,
    rejected: 0,
    unresolved: 0,
    stale: 0,
    sourceClassesChecked: ['identity'],
    missingSourceClasses: [],
  },
};

function setup(
  overrides: Partial<Parameters<typeof OutboundRailReadiness>[0]> = {}
) {
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
  const view = render(<OutboundRailReadiness {...props} />);
  return { props, ...view };
}

describe('OutboundRailReadiness certificate', () => {
  it('runs the next action and stays axe-clean when certified', async () => {
    const { props, container } = setup();
    const action = screen
      .getByTestId('outbound-next-action')
      .querySelector('button, a');
    expect(action).not.toBeNull();
    if (action?.tagName === 'BUTTON') {
      await userEvent.click(action);
      expect(
        [props.onReviewMessage, props.onCertify, props.onRefreshEvidence].some(
          fn => fn.mock.calls.length === 1
        )
      ).toBe(true);
    }
    await expectNoA11yViolations(container);
  });

  it('shows the loading state axe-clean', async () => {
    const { container } = setup({ certification: null, loading: true });
    expect(screen.getByText('Current facts are loading.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('announces an error axe-clean', async () => {
    const { container } = setup({ error: 'Approval refused.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Approval refused.');
    await expectNoA11yViolations(container);
  });

  it('lists stale and unresolved facts and offers certification', async () => {
    const { container } = setup({
      certification: {
        ...certified,
        status: 'stale',
        coverage: { ...certified.coverage, stale: 2, unresolved: 1 },
      },
    });
    expect(screen.getByText('1 unresolved fact · 2 stale facts')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
