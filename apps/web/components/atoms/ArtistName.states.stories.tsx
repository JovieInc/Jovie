import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistName } from './ArtistName';

/** Rendered states of the artist name heading, beside ArtistName.stories.tsx. */
const meta = {
  title: 'Atoms/ArtistName States',
  component: ArtistName,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Taylor Swift',
    handle: 'taylorswift',
  },
} satisfies Meta<typeof ArtistName>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no verification badge and no profile link, inline as a span. */
export const PartialUnlinkedInline: Story = {
  args: {
    isVerified: false,
    showLink: false,
    as: 'span',
    size: 'md',
  },
};

/** Long content: a long stage name wraps inside a narrow column with its badge. */
export const LongContentStageName: Story = {
  args: {
    name: 'The Midnight Orchestra and the Late Night Chorus of Saint Augustine',
    handle: 'midnightorchestra',
    isVerified: true,
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic name keeps the badge on the reading end. */
export const RtlArabicName: Story = {
  args: {
    name: 'فيروز',
    handle: 'fairuz',
    isVerified: true,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
