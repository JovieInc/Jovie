import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { AdminPeopleRightPanelProvider } from './AdminPeopleRightPanelProvider';

/**
 * State coverage for the shared Admin People right-panel owner. The provider
 * renders its children unchanged, so these show the tab content it wraps.
 */
const meta = {
  title: 'Features/Admin/AdminPeopleRightPanelProvider States',
  component: AdminPeopleRightPanelProvider,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <RightPanelProvider>
        <div className='w-80'>
          <Story />
        </div>
      </RightPanelProvider>
    ),
  ],
} satisfies Meta<typeof AdminPeopleRightPanelProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_TAB_COPY =
  'Admin People tab content with a deliberately long description of every creator, waitlist entry and invite row so the wrapped tab can be checked for clean wrapping inside the shared provider.';

/** Long content: long tab content wraps inside the provider. */
export const LongContentTabCopy: Story = {
  args: {
    children: (
      <div className='rounded-lg border border-subtle p-4 text-sm text-primary-token'>
        {LONG_TAB_COPY}
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(LONG_TAB_COPY)).toBeVisible();
  },
};

/** Right-to-left: tab content inside an Arabic RTL document. */
export const RtlArabic: Story = {
  args: {
    children: (
      <div
        dir='rtl'
        lang='ar'
        className='rounded-lg border border-subtle p-4 text-sm text-primary-token'
      >
        محتوى علامة تبويب الأشخاص
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('محتوى علامة تبويب الأشخاص')
    ).toBeVisible();
  },
};
