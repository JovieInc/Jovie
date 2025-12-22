import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrandingBadge } from './BrandingBadge';

const meta: Meta<typeof BrandingBadge> = {
  title: 'Organisms/BrandingBadge',
  component: BrandingBadge,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof BrandingBadge>;

export const Default: Story = {};

export const InProfileFooter: Story = {
  render: () => (
    <div className='w-80 p-4 border border-subtle rounded-lg bg-surface text-center'>
      <p className='text-sm text-secondary mb-4'>Profile content above...</p>
      <div className='pt-4 border-t border-subtle'>
        <BrandingBadge />
      </div>
    </div>
  ),
};
