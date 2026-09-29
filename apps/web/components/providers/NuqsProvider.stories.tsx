import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NuqsProvider } from './NuqsProvider';

const meta = {
  title: 'Providers/NuqsProvider',
  component: NuqsProvider,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: (
      <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'>
        Page content
      </p>
    ),
  },
} satisfies Meta<typeof NuqsProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
