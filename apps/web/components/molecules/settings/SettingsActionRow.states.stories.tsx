import { Button } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { Download } from 'lucide-react';
import { expect, within } from 'storybook/test';
import { SettingsActionRow } from './SettingsActionRow';

const panel: Decorator = function SettingsColumn(Story) {
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

/** State coverage for the settings action row; Default, Disabled and Destructive live in SettingsActionRow.stories.tsx. */
const meta = {
  title: 'Molecules/Settings/SettingsActionRow States',
  component: SettingsActionRow,
  parameters: { layout: 'centered' },
  decorators: [panel],
  args: { title: 'Export Data' },
} satisfies Meta<typeof SettingsActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only a title, with no icon, description or action. */
export const PartialTitleOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Export Data')).toBeVisible();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

/** Long content: a long title and description wrap beside the action. */
export const LongContentWrappedCopy: Story = {
  args: {
    icon: <Download className='h-4 w-4' aria-hidden />,
    title: 'Export every profile, link, contact, release and account setting',
    description:
      'Download a portable copy of your profile, every smart link and its click history, all contacts and fan emails, release metadata, payout settings and account preferences as one archive you can keep or import elsewhere.',
    action: (
      <Button type='button' variant='secondary' size='sm'>
        Export Data
      </Button>
    ),
  },
};

/** Right-to-left: an Arabic row and action in an RTL settings page. */
export const RtlArabic: Story = {
  args: {
    icon: <Download className='h-4 w-4' aria-hidden />,
    title: 'تصدير البيانات',
    description: 'نزّل نسخة من ملفك الشخصي وروابطك وإعدادات حسابك.',
    action: (
      <Button type='button' variant='secondary' size='sm'>
        تصدير
      </Button>
    ),
  },
  decorators: [rtl],
};
