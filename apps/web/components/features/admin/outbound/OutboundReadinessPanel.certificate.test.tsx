import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundReadinessPanel } from './OutboundReadinessPanel';

const readiness = {
  generatedAt: '2026-10-04T12:00:00Z',
  ready: 1,
  total: 2,
  items: [
    {
      id: 'certifications',
      label: 'Certifications cleared',
      status: 'green' as const,
      detail: 'No people waiting',
      owner: 'outbound',
      href: null,
    },
    {
      id: 'cone',
      label: 'Revenue cone',
      status: 'red' as const,
      detail: '1 of 8 receipts not green',
      owner: 'revenue',
      href: null,
      children: [
        {
          id: 'cone:golden',
          label: 'Golden Path',
          status: 'unknown' as const,
          detail: 'Receipt missing',
          owner: 'billing',
          href: '#golden-path',
        },
      ],
    },
  ],
};

describe('OutboundReadinessPanel certificate', () => {
  it('renders the checklist axe-clean and lets the linked receipt be followed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OutboundReadinessPanel
        readiness={readiness}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.getByTestId('readiness-certifications')).toHaveAttribute(
      'data-status',
      'green'
    );
    const link = screen.getByRole('link', { name: 'Golden Path' });
    await user.click(link);
    expect(link).toHaveAttribute('href', '#golden-path');
    await expectNoA11yViolations(container);
  });

  it('renders loading, error and empty states axe-clean', async () => {
    const loading = render(
      <OutboundReadinessPanel readiness={undefined} isLoading isError={false} />
    );
    expect(screen.getByText('Checking readiness…')).toBeVisible();
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    const failed = render(
      <OutboundReadinessPanel readiness={undefined} isLoading={false} isError />
    );
    expect(screen.getByText(/could not load/)).toBeVisible();
    await expectNoA11yViolations(failed.container);
    failed.unmount();

    const empty = render(
      <OutboundReadinessPanel
        readiness={{ ...readiness, items: [] }}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.getByTestId('outbound-readiness')).toBeEmptyDOMElement();
    await expectNoA11yViolations(empty.container);
  });
});
