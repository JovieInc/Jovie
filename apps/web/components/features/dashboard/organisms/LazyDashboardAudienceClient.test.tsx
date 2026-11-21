import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LazyDashboardAudienceClient } from './LazyDashboardAudienceClient';

const onPick = vi.fn();

vi.mock('./DashboardAudienceClient', () => ({
  DashboardAudienceClient: ({ mode }: { mode: string }) => (
    <button type='button' onClick={() => onPick(mode)}>
      Audience client {mode}
    </button>
  ),
}));

const props = {
  mode: 'members',
  view: 'all',
  initialRows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  sort: 'lastSeen',
  direction: 'desc',
  subscriberCount: 0,
  totalAudienceCount: 0,
} as const;

describe('LazyDashboardAudienceClient', () => {
  it('loads the audience client and forwards props and interaction', async () => {
    const user = userEvent.setup();
    const { container } = render(<LazyDashboardAudienceClient {...props} />);
    const button = await screen.findByRole('button', {
      name: 'Audience client members',
    });
    await user.click(button);
    expect(onPick).toHaveBeenCalledWith('members');
    await expectNoA11yViolations(container);
  });
});
