import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type {
  HudEnvActiveException,
  HudEnvExceptionLane,
} from '@/types/hud-env-exceptions';
import { HudEnvExceptionsPanel } from './HudEnvExceptionsPanel';

const entry: HudEnvActiveException = {
  id: 'pr-17166',
  kind: 'vercel-preview',
  workId: 'JOV-5941',
  sha: 'b4f93e3a9d6e201825aedc09d8d0dfc055e7d082',
  owner: 'itstimwhite',
  reason: 'Manual hosted preview for a supervisor walkthrough',
  requiredEvidence: 'manual-dispatch',
  environment: 'jovie-git-pr-17166',
  createdAt: '2026-09-04T01:10:00.000Z',
  expiresAt: '2026-09-05T01:10:00.000Z',
  ageMs: 45 * 60_000,
  expiresInMs: 2 * 3_600_000,
  expired: false,
  countsAsEvidence: false,
  cleanupState: 'cleanup-pending',
  costBudget: '$0.50',
  blocker: false,
  blockerReason: null,
};

const blocker: HudEnvActiveException = {
  ...entry,
  id: 'pr-16908',
  workId: 'JOV-5901',
  cleanupState: 'orphaned',
  blocker: true,
  blockerReason: 'Expired without a cleanup receipt',
};

const lane: HudEnvExceptionLane = {
  id: 'ci-neon-db',
  kind: 'neon-branch',
  policy: 'ephemeral-2h',
  owner: 'owl',
  surface: 'ci',
  evidencePurpose: 'migration proof',
  ttlHours: 2,
  cleanupTrigger: 'pr-close',
  costBudget: '$0.00',
};

function seedQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['hud', 'env-exceptions'], {
    schema: 'jovie-hud-env-exceptions/v1',
    generatedAt: '2026-09-04T02:00:00.000Z',
    updatedBy: 'neon-scheduled-cleanup',
    lanes: [lane],
    activeExceptions: [blocker, entry],
  });
  return queryClient;
}

function withQueryClient(children: ReactNode): ReactNode {
  return (
    <QueryClientProvider client={seedQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Admin/Hud/HudEnvExceptionsPanel',
  component: HudEnvExceptionsPanel,
  parameters: { layout: 'centered' },
  render: () => withQueryClient(<HudEnvExceptionsPanel />),
} satisfies Meta<typeof HudEnvExceptionsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
