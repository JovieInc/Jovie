import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Link from 'next/link';
import { MarketingCtaPendingLabel } from './MarketingCtaPendingLabel';

const meta: Meta<typeof MarketingCtaPendingLabel> = {
  title: 'Marketing/Primitives/MarketingCtaPendingLabel',
  component: MarketingCtaPendingLabel,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <Link
        href='/signup'
        className='relative inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground'
      >
        <Story />
      </Link>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Get started' },
};
