import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminQueryTabsSelect } from './AdminQueryTabsSelect';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/app/admin/system',
  search: 'tab=roster&page=2&pageSize=50&q=rio&sort=name&filter=open&panel=1',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

describe('AdminQueryTabsSelect', () => {
  beforeEach(() => {
    nav.push.mockReset();
  });

  it('pushes the view param and drops paging, search, sort and clearOnChange keys', async () => {
    const user = userEvent.setup();
    render(
      <AdminQueryTabsSelect
        param='tab'
        value='roster'
        clearOnChange={['filter']}
        options={[
          { value: 'roster', label: 'Roster' },
          { value: 'memory', label: 'Memory' },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'View: Roster' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Memory' }));

    expect(nav.push).toHaveBeenCalledExactlyOnceWith(
      '/app/admin/system?tab=memory&panel=1'
    );
  });
});
