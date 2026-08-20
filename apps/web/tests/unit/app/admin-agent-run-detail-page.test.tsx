import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadAdminAgentRun, mockNotFound } = vi.hoisted(() => ({
  mockLoadAdminAgentRun: vi.fn(),
  mockNotFound: vi.fn(),
}));

vi.mock('next/navigation', () => ({ notFound: mockNotFound }));

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
    <main data-testid={testId} data-page-title={title}>
      {children}
    </main>
  ),
}));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: vi.fn().mockResolvedValue('admin-user'),
}));

vi.mock('@/app/app/(shell)/admin/agent-runs/[id]/agent-run-data', () => ({
  loadAdminAgentRun: mockLoadAdminAgentRun,
}));

describe('AgentRunDebugPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAdminAgentRun.mockResolvedValue({
      id: 'run-12345678',
      userId: 'user-1',
      agentSlug: 'release-concierge',
      triggerKind: 'user',
      status: 'completed',
      inputContextDigest: 'sha256:digest',
      model: 'openai/gpt-5',
      prompt: 'Plan the release.',
      toolCalls: [{ name: 'calendar.lookup' }],
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      cost: '0.0123',
      error: 'Recovered provider warning',
      startedAt: new Date('2026-08-17T12:00:00Z'),
      completedAt: new Date('2026-08-17T12:01:00Z'),
    });
  });

  it('renders every debug section as a subordinate labeled region', async () => {
    const { default: AgentRunDebugPage } = await import(
      '@/app/app/(shell)/admin/agent-runs/[id]/page'
    );

    render(
      await AgentRunDebugPage({ params: Promise.resolve({ id: 'run-1' }) })
    );

    expect(screen.getByTestId('admin-agent-run-detail-page')).toHaveAttribute(
      'data-page-title',
      'Agent Run Debug'
    );
    const sectionNames = [
      'Run Metadata',
      'Token Usage',
      'Input Context Digest',
      'Rendered Prompt',
      'Tool Calls (1)',
      'Error',
    ];
    for (const name of sectionNames) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name })
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('Plan the release.')).toBeInTheDocument();
    expect(screen.getByText('Recovered provider warning')).toBeInTheDocument();
  });

  it('uses the route not-found boundary for missing runs', async () => {
    mockLoadAdminAgentRun.mockResolvedValue(null);
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    const { default: AgentRunDebugPage } = await import(
      '@/app/app/(shell)/admin/agent-runs/[id]/page'
    );

    await expect(
      AgentRunDebugPage({ params: Promise.resolve({ id: 'missing' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
