import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DataCard } from './DataCard';

/** Rendered states of the data card, beside DataCard.stories.tsx. */
const meta: Meta<typeof DataCard> = {
  title: 'Molecules/DataCard States',
  component: DataCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof DataCard>;

/** Partial: only a title; blank subtitle, metadata and badge are skipped. */
export const PartialTitleOnly: Story = {
  args: {
    title: 'spotify.com/artist/johndoe',
    subtitle: '  ',
    metadata: '',
    badge: '',
    className: 'w-96',
  },
};

/** Long content: a long title and subtitle truncate beside the action. */
export const LongContentTruncated: Story = {
  args: {
    title:
      'soundcloud.com/johndoe-official-artist-account-with-a-very-long-handle',
    subtitle:
      'SoundCloud profile connected from the label catalog import for every territory',
    metadata: 'Last checked 3 minutes ago',
    badge: 'Verified',
    badgeVariant: 'success',
    className: 'w-80',
    actions: (
      <Button variant='secondary' size='sm' onClick={fn()}>
        Edit
      </Button>
    ),
  },
};

/** Right-to-left: an Arabic card with its badge and action on a right-to-left page. */
export const RtlArabicCard: Story = {
  args: {
    title: 'ملف أنغامي',
    subtitle: 'صفحة الفنان',
    badge: 'نشط',
    badgeVariant: 'success',
    className: 'w-96',
    actions: (
      <Button variant='secondary' size='sm' onClick={fn()}>
        تعديل
      </Button>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
