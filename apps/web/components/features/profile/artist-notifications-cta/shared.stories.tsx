import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  profilePrimaryPillClassName,
  SubscriptionOtpResendAction,
  SubscriptionPearlComposer,
} from './shared';

const meta: Meta<typeof SubscriptionPearlComposer> = {
  title: 'Profile/SubscriptionPearlComposer',
  component: SubscriptionPearlComposer,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

export const Composer: StoryObj<typeof SubscriptionPearlComposer> = {
  render: () => (
    <div className='w-80 space-y-3'>
      <SubscriptionPearlComposer
        action={
          <button
            type='button'
            className={profilePrimaryPillClassName}
            disabled
          >
            Save
          </button>
        }
      >
        <input aria-label='First name' placeholder='First name' />
      </SubscriptionPearlComposer>
      <SubscriptionOtpResendAction
        resendCooldownEnd={0}
        isResending={false}
        onResend={() => undefined}
      />
    </div>
  ),
};
