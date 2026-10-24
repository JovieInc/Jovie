import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileMockup, type ProfileMockupProps } from './ProfileMockup';

const meta = {
  title: 'Features/Home/ProfileMockup',
  component: ProfileMockup,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileMockup>;

export default meta;
type Story = StoryObj<ProfileMockupProps>;

export const Default: Story = {};
export const LongName: Story = {
  args: { name: 'A creator with a longer display name', handle: 'longname' },
};
