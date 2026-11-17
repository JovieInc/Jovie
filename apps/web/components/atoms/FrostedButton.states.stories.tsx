import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { FrostedButton } from './FrostedButton';

/** Rendered states of the frosted action, beside FrostedButton.stories.tsx. */
const meta = {
  title: 'Atoms/FrostedButton States',
  component: FrostedButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Frosted action',
    onClick: fn(),
  },
} satisfies Meta<typeof FrostedButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a link with only an href, so tone and target take their defaults. */
export const PartialLinkDefaults: Story = {
  args: {
    href: '/pricing',
    children: 'See pricing',
  },
};

/** Long content: a long label inside a narrow container. */
export const LongContentLabel: Story = {
  args: {
    children: 'Continue to the release plan and every playlist pitch',
  },
  decorators: [
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an external Arabic link on a right-to-left page. */
export const RtlArabicLink: Story = {
  args: {
    href: 'https://example.com/ar',
    external: true,
    tone: 'outline',
    children: 'استمع الآن',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
