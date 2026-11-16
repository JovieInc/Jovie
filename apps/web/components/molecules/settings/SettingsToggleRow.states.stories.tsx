import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SettingsToggleRow } from './SettingsToggleRow';

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

/** State coverage for the settings toggle row; Interactive, Disabled, Saving and Gated live in SettingsToggleRow.stories.tsx. */
const meta: Meta<typeof SettingsToggleRow> = {
  title: 'Molecules/Settings/SettingsToggleRow States',
  component: SettingsToggleRow,
  parameters: { layout: 'centered' },
  decorators: [page],
};

export default meta;
type Story = StoryObj<typeof SettingsToggleRow>;

/** Partial: a title and switch with no icon or description. */
export const PartialTitleOnly: Story = {
  args: {
    title: 'High Contrast',
    checked: true,
    onCheckedChange: fn(),
    ariaLabel: 'Toggle high contrast mode',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch'));
    await expect(args.onCheckedChange).toHaveBeenCalledWith(false);
  },
};

/** Long content: a long title and description wrap beside the switch. */
export const LongContentWrappedCopy: Story = {
  args: {
    title: 'Increase contrast for text, borders and surfaces in every theme',
    description:
      'Raises the contrast of body text, hairline borders, focus rings and card surfaces across the dashboard, the public profile preview and every embedded player, in light and dark themes alike.',
    checked: false,
    onCheckedChange: fn(),
    ariaLabel: 'Toggle high contrast mode',
  },
};

/** Right-to-left: an Arabic toggle row in an RTL settings page. */
export const RtlArabic: Story = {
  args: {
    title: 'تباين عالٍ',
    description: 'زيادة التباين للنصوص والحدود والأسطح.',
    checked: true,
    onCheckedChange: fn(),
    ariaLabel: 'تبديل وضع التباين العالي',
  },
  decorators: [rtl],
};
