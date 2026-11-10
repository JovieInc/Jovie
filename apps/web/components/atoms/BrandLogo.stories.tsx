import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BrandLogo } from './BrandLogo';

const meta = {
  title: 'Atoms/BrandLogo',
  component: BrandLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    size: 'chrome',
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
    size: 'splash',
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
    size: 'control',
  },
};

export const Decorative: Story = {
  args: {
    tone: 'muted',
    size: 32,
    'aria-hidden': true,
  },
};

export const PartialDefaultsOnly: Story = {
  render: () => (
    <div className='rounded-lg bg-base p-6 text-primary-token'>
      <BrandLogo />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'No optional props supplied: the mark falls back to the chrome size, inherited colour, rounded frame and the Jovie wordmark as its accessible name.',
      },
    },
  },
};

export const LongContentAccessibleName: Story = {
  args: {
    size: 'splash',
    alt: 'Jovie, the link-in-bio and fan conversion platform for independent artists, DJs and labels, return to the homepage',
  },
  render: args => (
    <div className='flex w-48 items-center gap-2 text-primary-token'>
      <BrandLogo {...args} />
      <span className='min-w-0 truncate text-sm'>
        Midnight Sessions Vol. 2 (Deluxe Extended Anniversary Edition)
      </span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long accessible name and long neighbouring copy never stretch or squeeze the mark: it keeps its square slot and does not shrink.',
      },
    },
  },
};

export const Rtl: Story = {
  render: args => (
    <div dir='rtl' className='flex w-48 items-center gap-2 text-primary-token'>
      <BrandLogo {...args} alt='جوفي' />
      <span className='min-w-0 truncate text-sm'>
        جلسات منتصف الليل، الإصدار الثاني الفاخر الممتد
      </span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'In a right-to-left row the mark leads from the right and keeps its square slot beside truncated Arabic copy.',
      },
    },
  },
};
