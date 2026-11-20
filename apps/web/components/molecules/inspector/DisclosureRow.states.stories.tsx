import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DisclosureRow } from './DisclosureRow';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Inspector/DisclosureRow States',
  decorators: [CanvasFrame],
  component: DisclosureRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Rightsholders',
    children: (
      <p className='text-2xs text-tertiary-token'>
        Public composition observations, not master ownership.
      </p>
    ),
  },
} satisfies Meta<typeof DisclosureRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no summary, so the row shows only its label and chevron. */
export const PartialWithoutSummary: Story = {
  args: { defaultOpen: true },
};

/** Long content: a long label truncates beside its summary when open. */
export const LongContentLabel: Story = {
  args: {
    label:
      'Rightsholders, publishers and collecting societies observed for this work',
    summary: '12 observed',
    defaultOpen: true,
    children: (
      <p className='text-2xs text-tertiary-token'>
        Public composition observations from every connected registry,
        collecting society and publisher feed. These are observations, not
        master ownership, and may lag behind the latest registrations.
      </p>
    ),
  },
};

/** Right-to-left: Arabic label and summary inside an RTL inspector. */
export const RtlArabicRow: Story = {
  args: {
    label: 'أصحاب الحقوق',
    summary: '٢ ملاحظة',
    defaultOpen: true,
    children: (
      <p className='text-2xs text-tertiary-token'>
        ملاحظات عامة عن التأليف، وليست ملكية التسجيل الأصلي.
      </p>
    ),
  },
  decorators: [RtlFrame],
};
