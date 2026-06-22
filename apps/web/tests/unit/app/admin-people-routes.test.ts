import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAdminPeopleHref,
  searchParamsFromRecord,
} from '@/constants/admin-navigation';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

const PEOPLE_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/people/page.tsx'
);
const CREATORS_REDIRECT_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/admin/creators/page.tsx'
);

describe('admin people routes', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('keeps the people workspace inside the canonical AdminPage shell', () => {
    const source = readFileSync(PEOPLE_PAGE, 'utf8');

    expect(source).toContain('import { AdminPage }');
    expect(source).toContain('<AdminPage');
    expect(source).toContain("testId='admin-people-page'");
    expect(source).toContain('viewTestId={`admin-people-view-${view}`}');
    expect(source).toContain('AdminWaitlistTableWithViews');
    expect(source).toContain('AdminCreatorsPageWrapper');
    expect(source).toContain('AdminUsersTableUnified');
    expect(source).toContain('AdminReleasesPageWrapper');
    expect(source).toContain('AdminFeedbackTable');
    expect(source).not.toContain('requireAdmin');
    expect(source).not.toContain('getCachedAuth');
  });

  it('keeps the legacy creators route as a people creators redirect', () => {
    const source = readFileSync(CREATORS_REDIRECT_PAGE, 'utf8');

    expect(source).toContain("title: 'Admin creators'");
    expect(source).toContain(
      "redirect(buildAdminPeopleHref('creators', params))"
    );
    expect(source).not.toContain('AdminPage');
    expect(source).not.toContain('getAdminCreatorProfiles');
  });

  it('preserves search params when redirecting legacy creator traffic', async () => {
    const { default: AdminCreatorsRedirectPage } = await import(
      '@/app/app/(shell)/admin/creators/page'
    );
    const searchParams = {
      page: '2',
      pageSize: '50',
      q: 'E2E Admin',
      sort: 'created_desc',
    };

    await expect(
      AdminCreatorsRedirectPage({
        searchParams: Promise.resolve(searchParams),
      })
    ).rejects.toThrow(
      `NEXT_REDIRECT:${buildAdminPeopleHref(
        'creators',
        searchParamsFromRecord(searchParams)
      )}`
    );

    expect(redirectMock).toHaveBeenCalledWith(
      buildAdminPeopleHref('creators', searchParamsFromRecord(searchParams))
    );
  });
});
