import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect,
}));

import AdminCreatorsRedirectPage from '@/app/app/(shell)/admin/creators/page';
import AdminUsersRedirectPage from '@/app/app/(shell)/admin/users/page';

function expectRedirectToEqualQuery(
  actualHref: string,
  expectedPathname: string,
  expectedEntries: Record<string, string>
) {
  const url = new URL(actualHref, 'https://example.com');
  expect(url.pathname).toBe(expectedPathname);
  expect(Object.fromEntries(url.searchParams.entries())).toEqual(
    expectedEntries
  );
}

describe('admin legacy route redirects', () => {
  beforeEach(() => {
    redirect.mockReset();
  });

  it('preserves incoming creators search params when redirecting to the people workspace', async () => {
    await AdminCreatorsRedirectPage({
      searchParams: Promise.resolve({
        q: 'tim',
        page: '3',
        pageSize: '40',
        sort: 'created_desc',
      }),
    });

    expectRedirectToEqualQuery(
      redirect.mock.calls[0]?.[0],
      '/app/admin/people',
      {
        view: 'creators',
        q: 'tim',
        page: '3',
        pageSize: '40',
        sort: 'created_desc',
      }
    );
  });

  it('preserves incoming users search params when redirecting to the people workspace', async () => {
    await AdminUsersRedirectPage({
      searchParams: Promise.resolve({
        q: 'approved',
        page: '2',
        pageSize: '25',
        sort: 'created_desc',
      }),
    });

    expectRedirectToEqualQuery(
      redirect.mock.calls[0]?.[0],
      '/app/admin/people',
      {
        view: 'users',
        q: 'approved',
        page: '2',
        pageSize: '25',
        sort: 'created_desc',
      }
    );
  });
});
