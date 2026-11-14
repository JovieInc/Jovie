import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { OutboundReadiness } from '@/lib/outbound/readiness';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundReadinessPanel } from './OutboundReadinessPanel';

const LONG_DETAIL =
  'Seven of eight receipts are green, but the payment entitlement receipt has been red since the last deploy and blocks every acquisition send until the Golden Path lane passes again.';

const READINESS: OutboundReadiness = {
  generatedAt: '2026-10-04T12:00:00Z',
  ready: 1,
  total: 4,
  items: [
    {
      id: 'certifications',
      label: 'Certifications cleared',
      status: 'green',
      detail: 'No people waiting on fact review',
      owner: 'outbound',
      href: '/app/admin/outbound',
    },
    {
      id: 'cone',
      label: 'Revenue cone: acquisition eligible',
      status: 'red',
      detail: LONG_DETAIL,
      owner: 'revenue',
      href: null,
      children: [
        {
          id: 'cone:payment_entitlement',
          label: 'Golden Path',
          status: 'red',
          detail: 'Fix the Golden Path lane failure.',
          owner: 'billing',
          href: 'https://linear.app/jovie/issue/JOV-7192',
        },
      ],
    },
    {
      id: 'production',
      label: 'Production is current',
      status: 'unknown',
      detail: 'Build info unavailable',
      owner: 'release',
      href: null,
    },
    {
      id: 'note',
      label: 'Sends are manual',
      status: 'info',
      detail: 'Approving records your decision.',
      owner: 'outbound',
      href: null,
    },
  ],
};

describe('OutboundReadinessPanel certificate states', () => {
  it('says it is checking while readiness loads', async () => {
    const { container } = render(
      <OutboundReadinessPanel readiness={undefined} isLoading isError={false} />
    );
    expect(screen.getByText('Checking readiness…')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('says how to recover when readiness fails, even while refetching', async () => {
    const { container } = render(
      <OutboundReadinessPanel readiness={undefined} isLoading isError />
    );
    expect(
      screen.getByText('Readiness could not load. Refresh to try again.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('holds its height with no copy before the first request starts', () => {
    const { container } = render(
      <OutboundReadinessPanel
        readiness={undefined}
        isLoading={false}
        isError={false}
      />
    );
    expect(container.querySelector('p')).toHaveClass('min-h-24');
    expect(container.querySelector('p')).toBeEmptyDOMElement();
  });

  it('renders an empty named list when readiness has no items', async () => {
    const { container } = render(
      <OutboundReadinessPanel
        readiness={{ ...READINESS, ready: 0, total: 0, items: [] }}
        isLoading={false}
        isError={false}
      />
    );
    expect(
      screen.getByRole('list', { name: 'Readiness' })
    ).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('names every status, nests child receipts and wraps long details', async () => {
    const { container } = render(
      <OutboundReadinessPanel
        readiness={READINESS}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.getAllByLabelText('Ready')).toHaveLength(1);
    expect(screen.getAllByLabelText('Blocking')).toHaveLength(2);
    expect(screen.getAllByLabelText('Unknown')).toHaveLength(1);
    expect(screen.getAllByLabelText('Note')).toHaveLength(1);
    expect(
      screen.getByTestId('readiness-cone:payment_entitlement')
    ).toHaveClass('pl-9');
    expect(screen.getByTestId('readiness-cone')).not.toHaveClass('pl-9');
    expect(
      within(screen.getByTestId('readiness-cone')).getByText(LONG_DETAIL)
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('readiness-production')).getByText('release')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens external receipts in a new tab and keeps internal links in place', async () => {
    const user = userEvent.setup();
    render(
      <OutboundReadinessPanel
        readiness={READINESS}
        isLoading={false}
        isError={false}
      />
    );
    const internal = screen.getByRole('link', {
      name: 'Certifications cleared',
    });
    const external = screen.getByRole('link', { name: 'Golden Path' });
    expect(internal).toHaveAttribute('href', '/app/admin/outbound');
    expect(internal).not.toHaveAttribute('target');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noreferrer');

    await user.tab();
    expect(internal).toHaveFocus();
    await user.tab();
    expect(external).toHaveFocus();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('stays axe clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <OutboundReadinessPanel
          readiness={{
            ...READINESS,
            items: [
              {
                id: 'certifications',
                label: 'تم اعتماد الشهادات',
                status: 'green',
                detail: 'لا يوجد أشخاص بانتظار مراجعة الحقائق',
                owner: 'outbound',
                href: null,
              },
            ],
          }}
          isLoading={false}
          isError={false}
        />
      </div>
    );
    expect(screen.getByText('تم اعتماد الشهادات')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
