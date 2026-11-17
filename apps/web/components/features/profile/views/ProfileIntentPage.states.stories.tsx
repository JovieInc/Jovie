import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileIntentPage } from './ProfileIntentPage';

/**
 * Rendered states of the routed profile intent page. The default stories
 * live in ProfileIntentPage.stories.tsx.
 */
const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Profile/ProfileIntentPage/States',
  component: ProfileIntentPage,
  parameters: { layout: 'fullscreen' },
  args: {
    mode: 'contact',
    artistName: 'Tim White',
    artistHandle: 'tim',
    children: null,
  },
} satisfies Meta<typeof ProfileIntentPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the page chrome with an empty body slot. */
export const EmptyBody: Story = {};

/** Long content: a long artist name and a body taller than the viewport. */
export const LongContentBody: Story = {
  args: {
    mode: 'about',
    artistName:
      'The Midnight Collective Orchestra and Friends Featuring Special Guests',
    children: (
      <div className='space-y-4 text-sm text-secondary-token'>
        {Array.from({ length: 12 }, (_, index) => (
          <p key={index}>
            Producer, songwriter, and after-hours romantic who has spent fifteen
            years building records in borrowed studios and late-night sessions
            across three continents.
          </p>
        ))}
      </div>
    ),
  },
};

/** Right-to-left: an Arabic artist and body in an Arabic document direction. */
export const RtlArabicArtist: Story = {
  args: {
    mode: 'listen',
    artistName: 'فرقة منتصف الليل',
    children: <p className='text-sm text-secondary-token'>استمع الآن</p>,
  },
  decorators: [RtlFrame],
};
