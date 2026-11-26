import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { InfoPopover } from './InfoPopover';

/** Rendered states of the inspector info popover, each opened. */
const meta = {
  title: 'Molecules/Inspector/InfoPopover/States',
  component: InfoPopover,
  parameters: { layout: 'centered' },
  args: { label: 'About downloads', children: <p>Helper copy.</p> },
} satisfies Meta<typeof InfoPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

const inRow: Decorator = function InRow(Story) {
  return (
    <div className='flex h-48 w-80 max-w-full items-end justify-end'>
      <Story />
    </div>
  );
};

const inRtlRow: Decorator = function InRtlRow(Story) {
  return (
    <div
      dir='rtl'
      lang='ar'
      className='flex h-48 w-80 max-w-full items-end justify-end'
    >
      <Story />
    </div>
  );
};

const openPopover = async ({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}) => {
  await userEvent.click(within(canvasElement).getByRole('button'));
};

/** Partial: only the required label and copy; side, align and test id default. */
export const PartialRequiredPropsOnly: Story = {
  decorators: [inRow],
  play: openPopover,
};

/** Long content: helper copy that wraps past the popover max width. */
export const LongContentHelperCopy: Story = {
  args: {
    children: (
      <p>
        Email gate to file. Only attested recordings can go live, and every
        download is logged against the release so you can see who collected the
        file and when they joined your list.
      </p>
    ),
  },
  decorators: [inRow],
  play: openPopover,
};

/** Right-to-left: Arabic label and helper copy in an Arabic document. */
export const RtlArabicHelperCopy: Story = {
  args: {
    label: 'حول التنزيلات',
    children: <p>تبقى نصوص المساعدة خلف أيقونة المعلومات.</p>,
  },
  decorators: [inRtlRow],
  play: openPopover,
};
