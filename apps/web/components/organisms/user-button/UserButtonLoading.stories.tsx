import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  BillingLoadingRow,
  UserButtonLoadingPlaceholder,
  UserButtonTriggerAvatar,
} from './UserButtonLoading';

/** The account button's placeholders at the width of the open sidebar. */
const meta = {
  title: 'Organisms/UserButton/Loading',
  component: UserButtonLoadingPlaceholder,
  parameters: { layout: 'centered', themes: { themeOverride: 'dark' } },
  decorators: [
    Story => (
      <div className='w-56 bg-sidebar px-3 py-3 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { showUserInfo: true, calm: true },
} satisfies Meta<typeof UserButtonLoadingPlaceholder>;
export default meta;
type Story = StoryObj<typeof meta>;

const light = { themes: { themeOverride: 'light' } };

/** The compact sidebar row while the session loads. */
export const LoadingSidebarRow: Story = {};
/** JOV-12383: the fill stays visible on the light sidebar. */
export const LoadingSidebarRowLight: Story = { parameters: light };
/** The bare avatar button while the session loads. */
export const LoadingAvatarOnly: Story = { args: { showUserInfo: false } };
export const LoadingAvatarOnlyLight: Story = {
  ...LoadingAvatarOnly,
  parameters: light,
};
/** The billing row in the open menu while the plan loads. */
export const LoadingBillingRow: Story = { render: () => <BillingLoadingRow /> };
/** The trigger avatar with no image falls back to initials. */
export const EmptyNoImage: Story = {
  render: () => (
    <UserButtonTriggerAvatar
      calm
      src={undefined}
      name='Adele Adkins'
      alt='Adele Adkins'
    />
  ),
};
/** A long name keeps the avatar at its size; the name truncates beside it. */
export const LongContentNarrowRail: Story = {
  render: () => (
    <div className='flex w-28 items-center gap-2'>
      <UserButtonTriggerAvatar
        calm
        src={undefined}
        name='Adele Laurie Blue Adkins of Tottenham'
        alt='Adele Laurie Blue Adkins of Tottenham'
      />
      <span className='min-w-0 truncate text-xs'>
        Adele Laurie Blue Adkins of Tottenham
      </span>
    </div>
  ),
};
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
