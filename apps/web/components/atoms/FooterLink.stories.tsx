import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FooterLink } from './FooterLink';

const meta = {
  title: 'Atoms/FooterLink',
  component: FooterLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/privacy',
    children: 'Privacy Policy',
  },
  render: args => (
    <div className='rounded-md bg-base px-2 py-2'>
      <FooterLink {...args} />
    </div>
  ),
} satisfies Meta<typeof FooterLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};

export const Light: Story = {
  args: {
    tone: 'light',
  },
  render: args => (
    <div className='rounded-md bg-surface-1 px-2 py-2'>
      <FooterLink {...args} />
    </div>
  ),
};

export const External: Story = {
  args: {
    href: 'https://jov.ie',
    children: 'jov.ie',
    external: true,
  },
};
