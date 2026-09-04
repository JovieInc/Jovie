import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MODES } from './phone-showcase-primitives';
import { StickyPhoneTour } from './StickyPhoneTour';

const meta = {
  title: 'Marketing/StickyPhoneTour',
  component: StickyPhoneTour,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    modes: MODES,
    introTitle: 'The right action for every fan.',
    introBadge: 'One profile. Every way fans support you.',
    artistHandle: 'tim',
  },
} satisfies Meta<typeof StickyPhoneTour>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <div className='min-h-dvh bg-page'>
      <StickyPhoneTour {...args} />
    </div>
  ),
};
