import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireCurrentAdminPageAccess = vi.fn();

vi.mock('@/lib/admin/page-access', () => ({ requireCurrentAdminPageAccess }));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { readonly children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('./DeferredChatUiPlayground', () => ({
  DeferredChatUiPlayground: () => <div>Chat scenario catalog</div>,
}));

describe('AdminChatPlaygroundPage', () => {
  beforeEach(() => requireCurrentAdminPageAccess.mockReset());

  it('requires admin access before rendering the catalog', async () => {
    const { default: AdminChatPlaygroundPage } = await import('./page');

    render(await AdminChatPlaygroundPage());

    expect(requireCurrentAdminPageAccess).toHaveBeenCalledOnce();
    expect(screen.getByText('Chat scenario catalog')).toBeInTheDocument();
  });
});
