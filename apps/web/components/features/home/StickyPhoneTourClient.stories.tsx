import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MODES } from './phone-showcase-primitives';
import { StickyPhoneTourClient } from './StickyPhoneTourClient';

const meta = {
  title: 'Marketing/StickyPhoneTourClient',
  component: StickyPhoneTourClient,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    modes: MODES,
    introTitle: 'The right action for every fan.',
    introBadge: 'One profile. Every way fans support you.',
    artistHandle: 'tim',
  },
} satisfies Meta<typeof StickyPhoneTourClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ScrollDriven: Story = {
  render: args => (
    <div className='min-h-dvh bg-page'>
      <StickyPhoneTourClient {...args} />
    </div>
  ),
};
