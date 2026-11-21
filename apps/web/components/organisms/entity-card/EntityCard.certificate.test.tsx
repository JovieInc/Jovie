import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityCard } from './EntityCard';
import type { EntityCardModel } from './types';

const show: EntityCardModel = {
  id: 'show-1',
  kind: 'show',
  imageAlt: 'The Echo',
  title: 'The Echo',
  meta: 'Los Angeles, CA',
  datePill: { month: 'Aug', day: '15' },
  interactive: true,
};

describe('EntityCard certificate', () => {
  it('fires the call to action, keeps the month in its own casing and has no axe violations', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <EntityCard
        model={{ ...show, cta: { label: 'Get Tickets', onClick } }}
        surface='app'
        treatment='detailed'
      />
    );

    expect(screen.getByText('Aug')).not.toHaveClass('uppercase');
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Get Tickets' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire a disabled call to action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <EntityCard
        model={{ ...show, cta: { label: 'Sold Out', disabled: true, onClick } }}
        surface='app'
        treatment='detailed'
      />
    );

    await user.click(screen.getByText('Sold Out'));
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders a title-only card without violations', async () => {
    const { container } = render(
      <EntityCard
        model={{ id: 'e', kind: 'person', imageAlt: '', title: 'New Artist' }}
        surface='app'
        treatment='compact'
      />
    );

    expect(screen.getByText('New Artist')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
