import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoClientProviders } from './DemoClientProviders';

const meta = {
  title: 'Features/Demo/DemoClientProviders',
  component: DemoClientProviders,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Query/tooltip/nuqs provider stack that lets /demo pages run without Clerk auth or a live QueryClient from the app shell.',
      },
    },
  },
} satisfies Meta<typeof DemoClientProviders>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        Demo experience content
      </div>
    ),
  },
};
