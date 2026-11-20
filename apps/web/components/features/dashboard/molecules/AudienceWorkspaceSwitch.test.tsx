import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { AudienceWorkspaceSwitch } from './AudienceWorkspaceSwitch';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => '/app/contacts',
  useSearchParams: () => new URLSearchParams(nav.search),
}));

/** Radix tab activation can push the same href more than once. */
function pushedHrefs(push: {
  mock: { calls: ReadonlyArray<readonly unknown[]> };
}) {
  return [...new Set(push.mock.calls.map(call => String(call[0])))];
}

describe('AudienceWorkspaceSwitch', () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.search = '';
  });

  it('names the workspace tablist and selects the given destination', () => {
    render(<AudienceWorkspaceSwitch value='audience' />);
    const tablist = screen.getByRole('tablist', { name: 'Audience Workspace' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(3);
    expect(
      within(tablist).getByRole('tab', { name: 'Audience' })
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the current query when Contacts opens Audience', async () => {
    nav.search = 'q=berlin&page=2';
    const user = userEvent.setup();
    render(<AudienceWorkspaceSwitch value='contacts' />);
    await user.click(screen.getByRole('tab', { name: 'Audience' }));
    expect(pushedHrefs(nav.push)).toEqual([
      `${APP_ROUTES.CONTACTS}?q=berlin&page=2&tab=audience`,
    ]);
  });

  it('opens Insights from Contacts', async () => {
    const user = userEvent.setup();
    render(<AudienceWorkspaceSwitch value='contacts' />);
    await user.click(screen.getByRole('tab', { name: 'Insights' }));
    expect(pushedHrefs(nav.push)).toEqual([APP_ROUTES.INSIGHTS]);
  });

  it('opens Audience without leftover filters from Insights', async () => {
    nav.search = 'category=growth';
    const user = userEvent.setup();
    render(<AudienceWorkspaceSwitch value='insights' />);
    await user.click(screen.getByRole('tab', { name: 'Audience' }));
    expect(pushedHrefs(nav.push)).toEqual([
      `${APP_ROUTES.CONTACTS}?tab=audience`,
    ]);
  });

  it('moves focus across the switch with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<AudienceWorkspaceSwitch value='contacts' />);
    const contacts = screen.getByRole('tab', { name: 'Contacts' });
    contacts.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Audience' })).toHaveFocus();
  });
});
