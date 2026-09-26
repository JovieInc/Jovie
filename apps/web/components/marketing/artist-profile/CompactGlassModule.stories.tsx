import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { CompactGlassModule } from './CompactGlassModule';
import { CaptureActionPill } from './captureShared';

const meta = {
  title: 'Marketing/ArtistProfile/CompactGlassModule',
  component: CompactGlassModule,
  parameters: {
    backgrounds: { default: 'dark' },
    jovie: { uncoveredProps: ['children', 'className'] },
  },
  decorators: [
    Story => (
      <div className='w-104 max-w-full bg-page p-6'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='idle' />
      </div>
    ),
  },
} satisfies Meta<typeof CompactGlassModule>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bare module: the shared compact-glass material around capture content. */
export const Default: Story = {};

/** Optional small uppercase module label. */
export const WithLabel: Story = { args: { label: 'Compact glass' } };
