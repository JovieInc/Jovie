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
  render: () => (
    <DesktopUpdateProvider>
      <div className='space-y-2 p-4'>
        <p className='text-sm font-semibold text-primary-token'>
          Shell content stays mounted inside the provider.
        </p>
        <p className='text-sm text-secondary-token'>
          The update modal only appears when the desktop updater bridge reports
          an actionable state.
        </p>
      </div>
    </DesktopUpdateProvider>
  ),
};
