import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RuntimeUpdateProvider } from './RuntimeUpdateProvider';

const meta = {
  title: 'Shell/RuntimeUpdateProvider',
  component: RuntimeUpdateProvider,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof RuntimeUpdateProvider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <RuntimeUpdateProvider>
      <div className='space-y-2 p-4'>
        <p className='text-sm font-semibold text-primary-token'>
          Shell content stays mounted inside the provider.
        </p>
        <p className='text-sm text-secondary-token'>
          Runtime update state survives route changes; the Inbox owns its
          display.
        </p>
      </div>
    </RuntimeUpdateProvider>
  ),
};
