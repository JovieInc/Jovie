import { screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminOutreachPage from '@/app/app/(shell)/admin/outreach/page';
import { LeadTable } from '@/features/admin/leads/LeadTable';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@jovie/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@jovie/ui')>();
  return {
    ...actual,
    Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    Button: ({ children, ...props }: ComponentProps<'button'>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
  };
});

describe('admin load failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when leads fail to load without firing a toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { toast } = await import('sonner');
    renderWithQueryClient(<LeadTable />);

    await waitFor(() => {
      expect(
        screen.getByText('No leads have been discovered yet')
      ).toBeInTheDocument();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows inline message when outreach counts fail to load without firing a toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { toast } = await import('sonner');
    renderWithQueryClient(<AdminOutreachPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'We could not load outreach counts right now. Please try again shortly.'
        )
      ).toBeInTheDocument();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});
