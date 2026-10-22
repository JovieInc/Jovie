import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AliasCollisionRecovery } from './AliasCollisionRecovery';

const meta = {
  title: 'Profile/AliasCollisionRecovery',
  component: AliasCollisionRecovery,
  parameters: { layout: 'centered' },
  args: {
    username: 'dualipa',
  },
} satisfies Meta<typeof AliasCollisionRecovery>;

export default meta;

export const AfterAliasRedirect: StoryObj<typeof AliasCollisionRecovery> = {
  render: args => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        Recovery mounts with no visible chrome. It reads #alias= after the edge
        redirect for <span className='font-medium'>{args.username}</span>.
      </p>
      <AliasCollisionRecovery {...args} />
    </div>
  ),
};
