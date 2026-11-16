import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { AuthShellWrapper } from './AuthShellWrapper';

const ShellContent = ({ label }: { label: string }) => (
  <div className='min-h-full space-y-4 p-6'>
    <div className='rounded-xl border border-subtle bg-surface p-5'>
      <p className='text-sm font-semibold text-primary-token'>{label}</p>
      <p className='mt-2 text-sm text-secondary-token'>
        Shell content remains in place while route chrome changes.
      </p>
    </div>
  </div>
);

function ThrowingHeaderAction(): ReactNode {
  throw new Error('Header action failed to render');
}

/** A route that injects a header action which throws while rendering. */
function RouteWithBrokenHeaderAction() {
  const { setHeaderActions } = useSetHeaderActions();
  useEffect(() => {
    setHeaderActions(<ThrowingHeaderAction />);
    return () => setHeaderActions(null);
  }, [setHeaderActions]);
  return <ShellContent label='Header action failed; the route stays usable' />;
}

const meta: Meta<typeof AuthShellWrapper> = {
  title: 'Organisms/AuthShellWrapper',
  component: AuthShellWrapper,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    children: <ShellContent label='Customer shell' />,
  },
  decorators: [withDashboardProviders],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PreviewPanelOpen: Story = {
  args: {
    previewPanelDefaultOpen: true,
    children: <ShellContent label='Customer shell with preview panel' />,
  },
};

export const OperatorShell: Story = {
  args: {
    mode: 'ov',
    children: <ShellContent label='Operator shell' />,
  },
};

/** A throwing route header action degrades to nothing; the shell stays up. */
export const ErrorHeaderAction: Story = {
  args: {
    children: <RouteWithBrokenHeaderAction />,
  },
};

/** The sidebar starts collapsed to its icon rail. */
export const PartialCollapsedSidebar: Story = {
  args: {
    sidebarDefaultOpen: false,
    children: <ShellContent label='Customer shell with a collapsed sidebar' />,
  },
};

export const LongContentRoute: Story = {
  args: {
    children: (
      <div className='space-y-3 p-6'>
        {Array.from({ length: 30 }, (_, index) => index + 1).map(track => (
          <p
            key={`track-${track}`}
            className='text-sm text-secondary-token break-words'
          >
            Track {track}: An Unusually Long Track Title That Wraps Inside The
            Content Panel Without Widening The Shell
          </p>
        ))}
      </div>
    ),
  },
};

/** Saving the sidebar preference fails offline; the shell keeps working. */
export const OfflineSidebarPersistence: Story = {
  args: {
    persistSidebarCollapsed: async () => {
      throw new TypeError('Failed to fetch');
    },
    children: (
      <ShellContent label='Offline: the sidebar preference is not saved' />
    ),
  },
};

/** A locked workspace drops Search and the retained route boundary. */
export const LockedWorkspace: Story = {
  args: {
    isWorkspaceLocked: true,
    children: <ShellContent label='Workspace locked' />,
  },
};

export const RtlShell: Story = {
  args: {
    children: <ShellContent label='مساحة عمل العميل' />,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
