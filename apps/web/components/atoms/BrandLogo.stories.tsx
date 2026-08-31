import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrandLogo } from './BrandLogo';

const meta = {
  title: 'Atoms/BrandLogo',
  component: BrandLogo,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof BrandLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='rounded-lg bg-base p-6 text-primary-token'>
      <BrandLogo />
    </div>
  ),
};

export const AlternateBrand: Story = {
  args: {
    variant: 'ov',
    tone: 'color',
    size: 56,
    rounded: false,
  },
};

export const Decorative: Story = {
  args: {
    tone: 'muted',
    size: 32,
    'aria-hidden': true,
  },
};
