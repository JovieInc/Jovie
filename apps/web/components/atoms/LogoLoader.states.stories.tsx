import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLoader } from './LogoLoader';

/** Rendered states of the living O loader, beside LogoLoader.stories.tsx. */
const meta = {
  title: 'Atoms/LogoLoader States',
  component: LogoLoader,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LogoLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the splash-size O announcing the default label. */
export const LoadingSplash: Story = {};

/** Partial: a compact size with no label, so the default name is announced. */
export const PartialCompactDefaultLabel: Story = {
  args: {
    size: 20,
  },
};

/** Long content: a long announced label never widens the mark. */
export const LongContentLabel: Story = {
  args: {
    size: 32,
    'aria-label':
      'Preparing your workspace, release plan and every connected profile',
  },
};

/** Right-to-left: an Arabic label inside a right-to-left panel. */
export const RtlArabicLabel: Story = {
  args: {
    size: 32,
    'aria-label': 'جارٍ التحميل',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
