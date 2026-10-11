import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Analytics } from './Analytics';

const meta = {
  title: 'Providers/Analytics',
  component: Analytics,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96 space-y-2 rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'>
        <p className='font-medium text-primary-token'>Analytics mount point</p>
        <p>
          Renders Vercel&apos;s <code>&lt;Analytics /&gt;</code> beacon and
          fires a page view on every pathname change. It has no visible output,
          so the empty render below is the true default state.
        </p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Analytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
