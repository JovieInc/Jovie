import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FooterNavigation } from './FooterNavigation';

const meta = {
  title: 'Molecules/FooterNavigation',
  component: FooterNavigation,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FooterNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {
  decorators: [
    Story => (
      <div className='bg-base p-4'>
        <Story />
      </div>
    ),
  ],
};

export const Light: Story = {
  args: {
    variant: 'light',
  },
  decorators: [
    Story => (
      <div className='bg-surface-0 p-4'>
        <Story />
      </div>
    ),
  ],
};

export const CustomLinks: Story = {
  args: {
    links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
      { href: '/legal/cookies', label: 'Cookies' },
    ],
  },
  decorators: [
    Story => (
      <div className='bg-surface-0 p-4'>
        <Story />
      </div>
    ),
  ],
};
