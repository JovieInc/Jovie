import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MarketingPageShell } from '../MarketingPageShell';
import { CompactGlassCaptureDemo } from './CompactGlassCaptureDemo';
import { CompactGlassModule } from './CompactGlassModule';
import { CaptureActionPill } from './captureShared';

const meta = {
  title: 'Marketing/ArtistProfile/CompactGlassCaptureDemo',
  component: CompactGlassCaptureDemo,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['capture', 'initialPhase', 'autoPlay', 'className'],
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

/** Still-capture state: the module with the confirmed pill, no controls. */
export const Static: Story = {
  render: () => (
    <CompactGlassModule>
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='done' />
      </div>
    </CompactGlassModule>
  ),
};

/** Long labels wrap instead of clipping the module (real fixture copy). */
export const LongContent: Story = {
  args: {
    initialPhase: 'done',
    label: ARTIST_PROFILE_COPY.capture.body,
    capture: {
      ...ARTIST_PROFILE_COPY.capture,
      action: {
        ...ARTIST_PROFILE_COPY.capture.action,
        confirmedLabel: ARTIST_PROFILE_COPY.capture.subhead,
      },
    },
  },
};

/** No-JS / failed-hydration fallback: useful static content remains. */
export const Fallback: Story = {
  render: () => (
    <CompactGlassModule>
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={ARTIST_PROFILE_COPY.capture} phase='idle' />
        <p className='compact-glass-module__status'>
          Demo preview — the live demo needs JavaScript; nothing is sent or
          stored.
        </p>
      </div>
    </CompactGlassModule>
  ),
};
