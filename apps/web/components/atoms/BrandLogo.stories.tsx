import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrandLogo } from './BrandLogo';

const meta = {
  title: 'Atoms/BrandLogo',
  component: BrandLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    size: 48,
    tone: 'auto',
    variant: 'jovie',
  },
} satisfies Meta<typeof BrandLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <div className='rounded-lg bg-base p-6 text-primary-token'>
      <BrandLogo {...args} />
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

export const ColorTone: Story = {
  args: {
    tone: 'color',
  },
};

export const MutedTone: Story = {
  args: {
    tone: 'muted',
  },
};

export const WhiteTone: Story = {
  args: {
    tone: 'white',
  },
  parameters: {
    backgrounds: { default: 'dark' },
    themes: { themeOverride: 'dark' },
  },
  decorators: [
    StoryComponent => (
      <div className='rounded-lg bg-surface-0 p-6'>
        <StoryComponent />
      </div>
    ),
  ],
};

export const Square: Story = {
  args: {
    rounded: false,
    size: 64,
  },
};

export const Decorative: Story = {
  args: {
    tone: 'muted',
    size: 32,
    'aria-hidden': true,
  },
};
