import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  DEMO_EARNINGS_RESPONSE,
  DEMO_PROFILE_SOCIAL_LINKS,
} from './demo-surface-fixtures';
import { DEMO_DASHBOARD_DATA } from './mock-dashboard-data';
import { SettingsDemoHarness } from './SettingsDemoHarness';

/**
 * State coverage for the settings demo harness: the demo app shell around a
 * settings or page body, with optional profile, links and earnings seed data.
 */
const SettingsCard = ({ body }: { readonly body?: string }) => (
  <div className='rounded-lg border border-subtle bg-surface-1 p-5'>
    <p className='text-app font-semibold text-primary-token'>Profile</p>
    <p className='mt-2 text-sm leading-5 text-secondary-token'>
      {body ?? 'Your name, handle and photo as fans see them.'}
    </p>
  </div>
);

const meta = {
  title: 'Features/Demo/SettingsDemoHarness States',
  component: SettingsDemoHarness,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    shell: 'settings',
    children: <SettingsCard />,
  },
} satisfies Meta<typeof SettingsDemoHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no profile, links or earnings, so nothing is hydrated. */
export const EmptySeedData: Story = {};

/** Partial: a profile with links but no earnings seeded. */
export const PartialProfileOnly: Story = {
  args: {
    dashboardData: DEMO_DASHBOARD_DATA,
    initialLinks: DEMO_PROFILE_SOCIAL_LINKS,
  },
};

/** Long content: a long settings body in the page shell with earnings. */
export const LongContentPageShell: Story = {
  args: {
    shell: 'page',
    dashboardData: DEMO_DASHBOARD_DATA,
    earningsData: DEMO_EARNINGS_RESPONSE,
    children: (
      <SettingsCard body='Your name, handle and photo as fans see them on your profile, in search results, on every smart link and in each release email. This deliberately long description wraps across several lines so the page shell can be checked for clean wrapping.' />
    ),
  },
};

/** Right-to-left: the settings shell inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    children: <SettingsCard body='اسمك ومعرّفك وصورتك كما يراها المعجبون.' />,
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
