import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ACCOUNT_MENU_HEADER_ROW_CLASS,
  AccountMenuHeader,
} from './AccountMenuHeader';

const meta = {
  title: 'Organisms/UserButton/AccountMenuHeader',
  component: AccountMenuHeader,
  parameters: { layout: 'centered' },
  args: {
    displayName: 'Tim White',
    userInitials: 'TW',
    userImageUrl: undefined,
    formattedUsername: '@timwhite',
    contactEmail: 'tim@example.com',
    isPro: true,
  },
  decorators: [
    Story => (
      <div className='w-60 rounded-xl border border-subtle bg-surface-elevated p-1'>
        <div className={`flex items-center ${ACCOUNT_MENU_HEADER_ROW_CLASS}`}>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof AccountMenuHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const light = { themes: { themeOverride: 'light' } };

/** Pro account with a handle. */
export const ProWithHandle: Story = {};

/** No Pro entitlement: the plan badge is withheld. */
export const PermissionDeniedFreePlan: Story = { args: { isPro: false } };

/** No handle: the email takes the second line. */
export const PartialEmailFallback: Story = {
  args: { formattedUsername: null },
};

/** Neither handle nor email: a single line, no empty spacer. */
export const EmptySecondaryLine: Story = {
  args: { formattedUsername: null, contactEmail: undefined },
};

/** A long name truncates before the badge. */
export const LongContentName: Story = {
  args: { displayName: 'Tim White And The Extremely Long Touring Band Name' },
};

/** Right-to-left with a long name: truncation and badge mirror. */
export const RtlLongName: Story = {
  ...LongContentName,
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

export const ProWithHandleLight: Story = {
  ...ProWithHandle,
  parameters: light,
};
export const PartialEmailFallbackLight: Story = {
  ...PartialEmailFallback,
  parameters: light,
};
