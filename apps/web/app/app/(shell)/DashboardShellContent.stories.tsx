import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UnavailablePage } from '@/components/UnavailablePage';
import { PageErrorState } from '@/features/feedback/PageErrorState';

/**
 * DashboardShellContent is an async server component: it reads request
 * cookies, the ban check and the workspace database before it renders, none
 * of which exist in the Storybook browser. Each story renders the exact
 * branch the component returns for that state, inside the shell's main slot.
 * DashboardShellContent.test.tsx drives the real component into each branch.
 */
function DashboardShellBranch({
  branch,
}: {
  readonly branch: 'workspace-load-failed' | 'account-unavailable';
}) {
  return (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      {branch === 'workspace-load-failed' ? (
        <PageErrorState message='Failed to load your workspace. Please refresh the page.' />
      ) : (
        <UnavailablePage />
      )}
    </div>
  );
}

const meta = {
  title: 'App/Shell/DashboardShellContent',
  component: DashboardShellBranch,
  parameters: { layout: 'fullscreen' },
  args: { branch: 'workspace-load-failed' },
} satisfies Meta<typeof DashboardShellBranch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The workspace read failed or stalled past 10 seconds. */
export const ErrorWorkspaceLoad: Story = {};

export const ErrorWorkspaceLoadNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** A banned account gets the generic unavailable page instead of the shell. */
export const PermissionDeniedBannedAccount: Story = {
  args: { branch: 'account-unavailable' },
};
