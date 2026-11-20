import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildDemoProfile } from '@/components/features/demo/mock-dashboard-data';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { ArtistThemeProvider } from './ArtistThemeProvider';

const DEMO_ARTIST = convertDrizzleCreatorProfileToArtist(buildDemoProfile());

const meta = {
  title: 'Features/Profile/ArtistThemeProvider States',
  component: ArtistThemeProvider,
  parameters: { layout: 'centered' },
  args: { artist: DEMO_ARTIST, children: null },
} satisfies Meta<typeof ArtistThemeProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_PARAGRAPH_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

/** Long content: a long profile body inside the themed provider. */
export const LongContent: Story = {
  args: {
    children: (
      <div className='w-80 space-y-2 rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        {LONG_PARAGRAPH_IDS.map(id => (
          <p key={id}>
            Profile content for an artist with a long biography that keeps going
            across every release, tour and collaboration.
          </p>
        ))}
      </div>
    ),
  },
};

/** Rtl: Arabic profile content in a right-to-left document. */
export const Rtl: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        محتوى الملف الشخصي
      </div>
    ),
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
