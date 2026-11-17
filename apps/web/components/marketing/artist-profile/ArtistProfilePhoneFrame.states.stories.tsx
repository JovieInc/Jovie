import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';

const LONG_LINES = Array.from(
  { length: 24 },
  (_, index) => `Tour date ${index + 1}: Los Angeles, The Echo, doors at 8pm`
);

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfilePhoneFrame States',
  component: ArtistProfilePhoneFrame,
  parameters: { layout: 'centered' },
  decorators: [
    function WithPageSurface(Story) {
      return (
        <div className='bg-base p-8 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: { children: null },
} satisfies Meta<typeof ArtistProfilePhoneFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a text-only screen before the profile screenshot is supplied. */
export const PartialTextOnlyScreen: Story = {
  args: {
    size: 'md',
    children: (
      <p className='p-6 text-sm text-secondary-token'>Profile preview</p>
    ),
  },
};

/** Long content: a screen taller than the viewport is clipped by the frame. */
export const LongContentScreen: Story = {
  args: {
    children: (
      <ul className='space-y-3 p-6 text-sm text-secondary-token'>
        {LONG_LINES.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ),
  },
};

/** Right-to-left: an Arabic screen inside the frame. */
export const RtlArabicScreen: Story = {
  args: {
    size: 'sm',
    children: (
      <p className='p-6 text-sm text-secondary-token'>
        استمع إلى الإصدار الجديد الآن.
      </p>
    ),
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
