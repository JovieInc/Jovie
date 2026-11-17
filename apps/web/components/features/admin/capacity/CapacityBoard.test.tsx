import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CapacityBoard } from './CapacityBoard';
import {
  CAPACITY_NOW,
  capacityOrder,
  capacityRegistryUpdatedAt,
  capacityView,
  emptyCapacityView,
  longCapacityView,
} from './capacityBoard.test-fixtures';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type BoardProps = Parameters<typeof CapacityBoard>[0];

function renderBoard(props: Partial<BoardProps> = {}) {
  return render(
    <CapacityBoard
      view={capacityView}
      order={capacityOrder}
      selectedId={null}
      basePath='/app/ov/capacity'
      now={CAPACITY_NOW}
      registryUpdatedAt={capacityRegistryUpdatedAt}
      liveOverlay='none'
      {...props}
    />
  );
}

describe('CapacityBoard certificate', () => {
  it('labels an inactive account in sentence case, not forced caps', async () => {
    const { container } = renderBoard({ selectedId: 'openai-codex' });
    const lapsed = screen.getByTestId('capacity-account-tim-jov-ie');
    const chip = within(lapsed).getByText('Lapsed');
    expect(chip).not.toHaveClass('uppercase');
    expect(within(lapsed).queryByText('LAPSED')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('marks an alarm in sentence case inside the alert role', async () => {
    const { container } = renderBoard({ selectedId: 'hyperagent' });
    const alert = within(screen.getByTestId('capacity-alerts')).getByRole(
      'alert'
    );
    const severity = within(alert).getByText('Alarm');
    expect(severity).not.toHaveClass('uppercase');
    await expectNoA11yViolations(container);
  });

  it('links every provider and marks the selected one as current', async () => {
    const user = userEvent.setup();
    renderBoard({ selectedId: 'openai-codex' });
    const nav = screen.getByRole('navigation', { name: 'Providers' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(capacityView.providers.length);
    const current = links.find(
      link => link.getAttribute('aria-current') === 'page'
    );
    expect(current).toHaveAttribute(
      'href',
      '/app/ov/capacity?provider=openai-codex'
    );
    await user.hover(links[0]);
    expect(links[0]).toBeVisible();
  });

  it('renders an empty registry without a provider screen', async () => {
    const { container } = renderBoard({ view: emptyCapacityView, order: [] });
    expect(screen.queryByTestId('capacity-alerts')).toBeNull();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Providers' })
      ).queryAllByRole('link')
    ).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('keeps long aliases in the account header', async () => {
    const { container } = renderBoard({
      view: longCapacityView,
      selectedId: 'openai-codex',
    });
    expect(
      screen.getAllByText(/studio-workstation-primary/).length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
