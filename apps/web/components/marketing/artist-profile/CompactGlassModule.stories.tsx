import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MarketingPageShell } from '../MarketingPageShell';
import { CompactGlassModule } from './CompactGlassModule';
import { CaptureActionPill } from './captureShared';

const meta = {
  title: 'Marketing/ArtistProfile/CompactGlassModule',
  component: CompactGlassModule,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['children', 'className'],
    },
  },
  decorators: [
    Story => (
      <MarketingPageShell className='min-h-screen bg-page'>
        <div className='mx-auto flex w-full max-w-96 flex-col px-6 py-16'>
          <Story />
        </div>
      </MarketingPageShell>
    ),
  ],
  render: args => (
    <CompactGlassModule {...args}>
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='idle' />
      </div>
    </CompactGlassModule>
  ),
} satisfies Meta<typeof CompactGlassModule>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bare module: the shared compact-glass material around capture content. */
export const Default: Story = {};

/** Optional small uppercase module label. */
export const WithLabel: Story = {
  args: { label: 'Compact glass' },
};
