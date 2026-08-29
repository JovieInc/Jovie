import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPageShell } from './MarketingPageShell';

const meta = {
  title: 'Marketing/Shells/MarketingPageShell',
  component: MarketingPageShell,
  parameters: { layout: 'fullscreen' },
  args: {
    children: (
      <main className='min-h-64 bg-base p-10 text-primary-token'>
        <h1 className='marketing-h2-linear'>A focused marketing page</h1>
      </main>
    ),
  },
  render: args => <MarketingPageShell {...args} />,
} satisfies Meta<typeof MarketingPageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
