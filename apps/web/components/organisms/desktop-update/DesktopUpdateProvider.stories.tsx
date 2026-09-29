import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesktopUpdateProvider } from './DesktopUpdateProvider';

const meta = {
  title: 'Organisms/DesktopUpdateProvider',
  component: DesktopUpdateProvider,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof DesktopUpdateProvider>;
export default meta;
type Story = StoryObj<typeof meta>;

// No window.jovieDesktop bridge in Storybook: the provider reports
// 'unsupported', renders children untouched, and mounts no modal.
export const Unsupported: Story = {
  args: {
    children: null,
  },
  render: () => (
    <DesktopUpdateProvider>
      <p className='p-4 text-sm text-secondary-token'>
        Shell content stays mounted; the modal only appears when the updater
        bridge reports an actionable state.
      </p>
    </DesktopUpdateProvider>
  ),
};
