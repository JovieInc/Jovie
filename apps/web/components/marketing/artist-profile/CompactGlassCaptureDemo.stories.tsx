import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPageShell } from '../MarketingPageShell';
import { CompactGlassCaptureDemo } from './CompactGlassCaptureDemo';

const meta = {
  title: 'Marketing/ArtistProfile/CompactGlassCaptureDemo',
  component: CompactGlassCaptureDemo,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['capture', 'className'],
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
} satisfies Meta<typeof CompactGlassCaptureDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Interactive default: press Play to run the isolated opt-in demo. */
export const Interactive: Story = {};

/** Scripted playback — same state machine, started automatically. */
export const ScriptedPlayback: Story = {
  args: { autoPlay: true },
};

/** Confirmed state offers Reset, which returns the demo to idle. */
export const Resettable: Story = {
  args: { initialPhase: 'done' },
};

/** Module label renders above the demo when it adds new information. */
export const WithLabel: Story = {
  args: { initialPhase: 'done', label: 'Fan opt-in demo' },
};
