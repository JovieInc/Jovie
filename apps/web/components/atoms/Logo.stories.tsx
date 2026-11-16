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

/** No optional props: the md wordmark in the surface's primary ink, named Jovie logo. */
export const PartialDefaultsOnly: Story = {
  render: () => (
    <div className='rounded-lg bg-base p-6'>
      <Logo />
    </div>
  ),
};

/** The wordmark keeps its own width beside long, truncated header copy. */
export const LongContentBesideTitle: Story = {
  render: args => (
    <div className='flex w-64 items-center gap-3 text-primary-token'>
      <Logo {...args} size='sm' />
      <span className='min-w-0 truncate text-sm'>
        Midnight Sessions Vol. 2 (Deluxe Extended Anniversary Edition)
      </span>
    </div>
  ),
};

/** In a right-to-left row the wordmark leads from the right and is never mirrored. */
export const Rtl: Story = {
  render: args => (
    <div dir='rtl' className='flex w-64 items-center gap-3 text-primary-token'>
      <Logo {...args} size='sm' />
      <span className='min-w-0 truncate text-sm'>
        جلسات منتصف الليل، الإصدار الثاني الفاخر الممتد
      </span>
    </div>
  ),
};
