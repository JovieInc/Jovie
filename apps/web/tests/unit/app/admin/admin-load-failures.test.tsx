import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminOutreachEmailPage from '@/app/app/(shell)/admin/outreach/email/page';
import AdminOutreachPage from '@/app/app/(shell)/admin/outreach/page';
import AdminOutreachReviewPage from '@/app/app/(shell)/admin/outreach/review/page';
import { LeadTable } from '@/components/admin/leads/LeadTable';

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

  it('shows inline message when leads fail to load without firing a toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { toast } = await import('sonner');
    render(<LeadTable />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Unable to load leads right now. Try again in a moment.'
        )
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
    render(<AdminOutreachPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'We could not load outreach counts right now. Please try again shortly.'
        )
      ).toBeInTheDocument();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows inline message when the email queue fails to load without firing a toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { toast } = await import('sonner');
    render(<AdminOutreachEmailPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'We could not load the email queue right now. Please try again shortly.'
        )
      ).toBeInTheDocument();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows inline message when the manual review queue fails to load without firing a toast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ total: 0 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { toast } = await import('sonner');
    render(<AdminOutreachReviewPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'We could not load the manual review queue right now. Please try again shortly.'
        )
      ).toBeInTheDocument();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});
