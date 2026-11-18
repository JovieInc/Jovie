import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { SmartLinkCreditGroup } from '@/app/[username]/[slug]/_lib/data';
import { ReleaseCreditsDrawer } from './ReleaseCreditsDrawer';

/**
 * Rendered states of the release credits drawer. The default open drawer
 * lives in ReleaseCreditsDrawer.stories.tsx.
 */
const meta = {
  title: 'Release/ReleaseCreditsDrawer/States',
  component: ReleaseCreditsDrawer,
  parameters: { layout: 'fullscreen', backgrounds: { default: 'dark' } },
  args: {
    open: true,
    onOpenChange: fn(),
    presentation: 'modal',
  },
} satisfies Meta<typeof ReleaseCreditsDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

const longCredits: SmartLinkCreditGroup[] = [
  {
    role: 'producer',
    label: 'Producer',
    entries: [
      {
        artistId: 'p1',
        name: 'An Exceptionally Long Producer Name That Keeps Going Past One Line',
        handle: 'long-producer',
        role: 'producer',
        position: 0,
      },
      {
        artistId: 'p2',
        name: 'Grace Hopper',
        handle: null,
        role: 'producer',
        position: 1,
      },
    ],
  },
  {
    role: 'mix_engineer',
    label: 'Mix engineer',
    entries: [
      {
        artistId: 'm1',
        name: 'Margaret Hamilton',
        handle: 'margaret',
        role: 'mix_engineer',
        position: 0,
      },
    ],
  },
  {
    role: 'mastering_engineer',
    label: 'Mastering engineer',
    entries: [
      {
        artistId: 'ma1',
        name: 'Katherine Johnson',
        handle: null,
        role: 'mastering_engineer',
        position: 0,
      },
    ],
  },
  {
    role: 'composer',
    label: 'Composer',
    entries: [
      {
        artistId: 'c1',
        name: 'Hedy Lamarr',
        handle: 'hedy',
        role: 'composer',
        position: 0,
      },
      {
        artistId: 'c2',
        name: 'Annie Easley',
        handle: null,
        role: 'composer',
        position: 1,
      },
    ],
  },
];

/** Empty: every credit group has no entries, so the drawer renders nothing. */
export const EmptyCredits: Story = {
  args: {
    credits: [{ role: 'producer', label: 'Producer', entries: [] }],
  },
};

/** Partial: one group whose collaborators have no Jovie profile to link. */
export const PartialUnlinkedCredits: Story = {
  args: {
    credits: [
      {
        role: 'featured_artist',
        label: 'Featured artist',
        entries: [
          {
            artistId: 'f1',
            name: 'Dorothy Vaughan',
            handle: null,
            role: 'featured_artist',
            position: 0,
          },
        ],
      },
    ],
  },
};

/** Long content: several roles and a name longer than one line. */
export const LongContentManyRoles: Story = {
  args: { credits: longCredits },
};

/** Right-to-left: Arabic role labels and names in an RTL document. */
export const RtlArabicCredits: Story = {
  args: {
    credits: [
      {
        role: 'producer',
        label: 'منتج',
        entries: [
          {
            artistId: 'ar1',
            name: 'ليلى أحمد',
            handle: 'layla',
            role: 'producer',
            position: 0,
          },
          {
            artistId: 'ar2',
            name: 'سامي خليل',
            handle: null,
            role: 'producer',
            position: 1,
          },
        ],
      },
    ],
  },
  decorators: [
    function RtlDocument(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
