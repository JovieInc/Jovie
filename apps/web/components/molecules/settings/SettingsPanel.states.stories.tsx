import { Button } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { SettingsPanel } from './SettingsPanel';

const page: Decorator = function SettingsColumn(Story) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

/** State coverage for the settings panel; Default and WithAction live in SettingsPanel.stories.tsx. */
const meta = {
  title: 'Molecules/Settings/SettingsPanel States',
  component: SettingsPanel,
  parameters: { layout: 'centered' },
  decorators: [page],
  args: {
    bodyClassName: 'px-4 py-4 sm:px-5',
    children: (
      <p className='text-app text-secondary-token'>Compact settings content</p>
    ),
  },
} satisfies Meta<typeof SettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a headerless panel with only its card body. */
export const PartialBodyOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
    await expect(canvas.getByText('Compact settings content')).toBeVisible();
  },
};

/** Long content: a long title, description and body beside a header action. */
export const LongContentWrappedHeader: Story = {
  args: {
    title: 'Appearance, contrast and motion preferences for every workspace',
    description:
      'Theme, contrast and reduced-motion preferences apply to the dashboard, the public profile preview and every embedded player you open from this workspace, on every device you sign in from.',
    actions: (
      <Button type='button' size='sm'>
        Save
      </Button>
    ),
    children: (
      <p className='text-app text-secondary-token'>
        Each preference saves as soon as it changes, and the preview on the
        right updates to match so you can check the result before you share the
        profile with anyone.
      </p>
    ),
  },
};

/** Right-to-left: an Arabic panel in an RTL settings page. */
export const RtlArabic: Story = {
  args: {
    title: 'المظهر',
    description: 'تفضيلات السمة والتباين لمساحة عملك.',
    actions: (
      <Button type='button' size='sm'>
        حفظ
      </Button>
    ),
    children: <p className='text-app text-secondary-token'>محتوى الإعدادات</p>,
  },
  decorators: [rtl],
};
