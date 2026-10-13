import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCurrentAdminPageAccess = vi.fn();
vi.mock('@/lib/admin/page-access', () => ({ requireCurrentAdminPageAccess }));
vi.mock('@/components/features/admin/hud/OvieInbox', () => ({
  OvieInbox: ({ caseId }: { readonly caseId?: string }) => (
    <section data-testid='existing-unified-inbox' data-case-id={caseId} />
  ),
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { readonly children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

describe('guarded Ovie inbox destination', () => {
  beforeEach(() => {
    requireCurrentAdminPageAccess.mockReset().mockResolvedValue('founder');
  });

  it('renders the existing inbox after the current admin and privacy guard', async () => {
    const { default: InboxPage } = await import('./page');
    render(await InboxPage({ searchParams: Promise.resolve({}) }));
    expect(requireCurrentAdminPageAccess).toHaveBeenCalledOnce();
    expect(screen.getByTestId('existing-unified-inbox')).not.toHaveAttribute(
      'data-case-id'
    );
  });
  it('binds an explicit current case without interpreting a decision', async () => {
    const { default: InboxPage } = await import('./page');
    const caseId = 'summer-card:sc_current_r2';
    render(
      await InboxPage({
        searchParams: Promise.resolve({ case: caseId, decision: 'approve' }),
      })
    );
    expect(screen.getByTestId('existing-unified-inbox')).toHaveAttribute(
      'data-case-id',
      caseId
    );
  });
  it.each([{ requested: ['one', 'two'] }, { requested: '' }])(
    'does not turn an ambiguous or empty requested case $requested into the default card',
    async ({ requested }) => {
      const { default: InboxPage } = await import('./page');
      render(
        await InboxPage({ searchParams: Promise.resolve({ case: requested }) })
      );
      expect(screen.getByTestId('existing-unified-inbox')).toHaveAttribute(
        'data-case-id',
        ''
      );
    }
  );
  it.each(['unauthenticated', 'non-admin', 'privacy-locked'])(
    'does not render or read the requested case when %s',
    async reason => {
      const { default: InboxPage } = await import('./page');
      requireCurrentAdminPageAccess.mockRejectedValue(new Error(reason));
      let read = false;
      const searchParams = {
        then: () => {
          read = true;
        },
      } as unknown as Promise<Record<string, string | string[] | undefined>>;
      await expect(InboxPage({ searchParams })).rejects.toThrow(reason);
      expect(read).toBe(false);
      expect(
        screen.queryByTestId('existing-unified-inbox')
      ).not.toBeInTheDocument();
    }
  );
});
