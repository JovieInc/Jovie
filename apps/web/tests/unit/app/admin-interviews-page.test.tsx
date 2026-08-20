import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadRows } = vi.hoisted(() => ({
  mockLoadRows: vi.fn(),
}));

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    testId,
  }: {
    children: ReactNode;
    title: string;
    testId: string;
  }) => (
    <section data-testid={testId} data-page-title={title}>
      {children}
    </section>
  ),
}));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: vi.fn().mockResolvedValue('admin-user'),
}));

vi.mock('@/app/app/(shell)/admin/interviews/interviews-data', () => ({
  loadAdminInterviewRows: mockLoadRows,
}));

describe('AdminInterviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadRows.mockResolvedValue([]);
  });

  it('renders the canonical empty state without a duplicate page title', async () => {
    const { default: AdminInterviewsPage } = await import(
      '@/app/app/(shell)/admin/interviews/page'
    );

    render(await AdminInterviewsPage());

    expect(screen.getByTestId('admin-interviews-page')).toHaveAttribute(
      'data-page-title',
      'User Interviews'
    );
    expect(
      screen.getByRole('heading', { name: 'No interviews yet' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'User Interviews' })
    ).toBeNull();
  });

  it('keeps interview status, summary, and transcript behavior intact', async () => {
    mockLoadRows.mockResolvedValue([
      {
        id: 'interview-1',
        source: 'onboarding',
        status: 'summarized',
        summary: 'Creators need a faster release workflow.',
        transcript: [
          {
            questionId: 'q1',
            prompt: 'What is hardest today?',
            answer: 'Keeping every launch asset in sync.',
            skipped: false,
          },
        ],
        createdAt: new Date('2026-08-17T12:00:00Z'),
        attempts: 1,
        userEmail: 'creator@example.com',
        userHandle: 'creator',
      },
    ]);
    const { default: AdminInterviewsPage } = await import(
      '@/app/app/(shell)/admin/interviews/page'
    );

    render(await AdminInterviewsPage());

    expect(
      screen.getByText('Creators need a faster release workflow.')
    ).toBeInTheDocument();
    expect(screen.getByText('Summarized')).toBeInTheDocument();
    expect(screen.getByText('Q1. What is hardest today?')).toBeInTheDocument();
    expect(
      screen.getByText('Keeping every launch asset in sync.')
    ).toBeInTheDocument();
  });
});
