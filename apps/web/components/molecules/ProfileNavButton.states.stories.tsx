import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileNavButton } from './ProfileNavButton';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='relative h-32 w-32 rounded-lg bg-surface-1'>
      <div className='absolute top-4 left-4'>
        <Story />
      </div>
    </div>
  );
};

const meta: Meta<typeof ProfileNavButton> = {
  title: 'Molecules/ProfileNavButton States',
  component: ProfileNavButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    showBackButton: false,
    artistHandle: 'testartist',
  },
  decorators: [CanvasFrame],
};

export default meta;
type Story = StoryObj<typeof ProfileNavButton>;

/** Loading: the profile is still resolving, so the logo pulses. */
export const LoadingProfile: Story = {
  args: {
    loading: true,
  },
};

/** Right-to-left: the menu trigger and back button inside an RTL page. */
export const RtlProfilePage: Story = {
  render: function RenderRtlProfilePage(args) {
    return (
      <div dir='rtl' className='flex gap-3'>
        <ProfileNavButton {...args} showBackButton={false} />
        <ProfileNavButton {...args} showBackButton />
      </div>
    );
  },
};
