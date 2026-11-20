import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AudienceMobileCard } from './AudienceMobileCard';
import { member } from './audienceMobileCard.test-fixtures';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceMobileCard States',
  component: AudienceMobileCard,
  args: { member, mode: 'members', onTap: fn(), onAction: fn() },
} satisfies Meta<typeof AudienceMobileCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PartialAnonymous: Story = {
  args: {
    member: { ...member, type: 'anonymous', displayName: null, email: null },
  },
};
export const LongContentName: Story = {
  args: {
    member: {
      ...member,
      displayName:
        'A musician with an especially long name that needs room to fit',
    },
  },
};
export const RtlMember: Story = {
  args: { member: { ...member, displayName: 'موسيقي' } },
  decorators: [
    function Rtl(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
