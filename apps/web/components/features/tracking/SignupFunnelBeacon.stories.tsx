import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SignupFunnelBeacon } from './SignupFunnelBeacon';

const meta = {
  title: 'Tracking/SignupFunnelBeacon',
  component: SignupFunnelBeacon,
  parameters: { layout: 'centered' },
  args: {
    surface: 'homepage',
    trackLanding: true,
  },
} satisfies Meta<typeof SignupFunnelBeacon>;

export default meta;

export const Homepage: StoryObj<typeof SignupFunnelBeacon> = {
  render: args => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        The funnel beacon mounts with no visible chrome. It records a landing
        view, and a CTA click for links into signup or a profile claim.
      </p>
      <SignupFunnelBeacon {...args} />
    </div>
  ),
};
