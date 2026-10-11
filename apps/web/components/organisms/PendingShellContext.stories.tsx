import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  PendingShellContext,
  type PendingShellContextValue,
  usePendingShell,
} from './PendingShellContext';

function PendingShellReadout() {
  const { pendingShellRoute } = usePendingShell();
  return (
    <div className='p-4 text-sm text-primary-token'>
      pendingShellRoute:{' '}
      <span className='font-caption'>{pendingShellRoute ?? 'none'}</span>
    </div>
  );
}

const activeValue: PendingShellContextValue = {
  clearPendingShell: () => {},
  pendingShellRoute: 'releases',
  showPendingShell: () => {},
};

const meta = {
  title: 'Organisms/PendingShellContext',
  component: PendingShellReadout,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof PendingShellReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoopDefault: Story = {};

export const PendingRoute: Story = {
  decorators: [
    Story => (
      <PendingShellContext.Provider value={activeValue}>
        <Story />
      </PendingShellContext.Provider>
    ),
  ],
};
