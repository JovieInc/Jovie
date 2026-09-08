import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoAuthShell } from './DemoAuthShell';

const StoryContent = () => (
  <div className='p-6'>
    <div className='max-w-xl rounded-lg border border-subtle bg-surface-1 p-5'>
      <p className='text-app font-semibold text-primary-token'>
        Demo workspace
      </p>
      <p className='mt-2 text-sm leading-5 text-secondary-token'>
        Authenticated demo chrome renders with seeded billing, release, and
        weekly message usage data.
      </p>
    </div>
  </div>
);

const meta = {
  title: 'Features/Demo/DemoAuthShell',
  component: DemoAuthShell,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['dashboardData', 'releasesForQuery', 'seedQueryClient'],
    },
  },
  args: {
    children: <StoryContent />,
  },
} satisfies Meta<typeof DemoAuthShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
