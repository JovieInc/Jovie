import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

function stub(name: string) {
  return function Stub() {
    return <div data-testid={`lazy-${name}`} />;
  };
}

vi.mock('@/components/features/admin/admin-assets-table', () => ({
  AdminAssetsPageWrapper: stub('AdminAssetsPageWrapper'),
}));
vi.mock(
  '@/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper',
  () => ({ AdminCreatorsPageWrapper: stub('AdminCreatorsPageWrapper') })
);
vi.mock(
  '@/components/features/admin/feedback-table/AdminFeedbackTable',
  () => ({
    AdminFeedbackTable: stub('AdminFeedbackTable'),
  })
);
vi.mock('@/components/features/admin/admin-releases-table', () => ({
  AdminReleasesPageWrapper: stub('AdminReleasesPageWrapper'),
}));
vi.mock(
  '@/components/features/admin/admin-users-table/AdminUsersTableUnified',
  () => ({ AdminUsersTableUnified: stub('AdminUsersTableUnified') })
);
vi.mock(
  '@/components/features/admin/waitlist-table/AdminWaitlistTableWithViews',
  () => ({ AdminWaitlistTableWithViews: stub('AdminWaitlistTableWithViews') })
);
vi.mock('@/components/features/admin/WaitlistSettingsPanel', () => ({
  WaitlistSettingsPanel: stub('WaitlistSettingsPanel'),
}));

// Real next/dynamic: each lazy boundary must resolve to the export it wraps.
describe('Admin People lazy views', () => {
  it('resolves every lazy view to the component it wraps', async () => {
    const views = (await import(
      '@/app/app/(shell)/admin/people/AdminPeopleLazyViews'
    )) as unknown as Record<string, ComponentType>;
    const names = Object.keys(views).sort();
    expect(names).toEqual([
      'AdminAssetsPageWrapper',
      'AdminCreatorsPageWrapper',
      'AdminFeedbackTable',
      'AdminReleasesPageWrapper',
      'AdminUsersTableUnified',
      'AdminWaitlistTableWithViews',
      'WaitlistSettingsPanel',
    ]);

    render(
      <div>
        {names.map(name => {
          const View = views[name];
          return <View key={name} />;
        })}
      </div>
    );

    for (const name of names) {
      expect(await screen.findByTestId(`lazy-${name}`)).toBeInTheDocument();
    }
  });
});
