import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Logo } from './Logo';

const meta = {
  title: 'Atoms/Logo',
  component: Logo,
  parameters: {
    layout: 'centered',
  },
  args: {
    size: 'md',
    variant: 'word',
    tone: 'auto',
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WordAlt: Story = {
  args: {
    variant: 'wordAlt',
  },
};

export const Icon: Story = {
  args: {
    variant: 'icon',
    tone: 'color',
  },
};

export const Full: Story = {
  args: {
    variant: 'full',
  },
};

export const FullAlt: Story = {
  args: {
    variant: 'fullAlt',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    variant: 'word',
  },
};

export const MutedFullWordmark: Story = {
  args: {
    variant: 'full',
    size: 'sm',
    tone: 'muted',
  },
};

export const WhiteTone: Story = {
  args: {
    tone: 'white',
    variant: 'icon',
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

export const Decorative: Story = {
  args: {
    variant: 'word',
    size: 'xs',
    'aria-hidden': true,
  },
};
