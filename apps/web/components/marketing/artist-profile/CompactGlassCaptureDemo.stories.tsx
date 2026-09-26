import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CompactGlassCaptureDemo } from './CompactGlassCaptureDemo';

const meta = {
  title: 'Marketing/ArtistProfile/CompactGlassCaptureDemo',
  component: CompactGlassCaptureDemo,
  parameters: {
    backgrounds: { default: 'dark' },
    jovie: { uncoveredProps: ['initialPhase', 'className'] },
  },
  decorators: [
    Story => (
      <div className='w-104 max-w-full bg-page p-6'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompactGlassCaptureDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Interactive default: press Play to run the isolated opt-in demo. */
export const Interactive: Story = {};

/** Confirmed state offers Reset, which returns the demo to idle. */
export const Resettable: Story = { args: { initialPhase: 'done' } };

/** Optional module label above the demo. */
export const WithLabel: Story = {
  args: { initialPhase: 'done', label: 'Compact glass' },
};
