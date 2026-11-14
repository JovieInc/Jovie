import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { AdminTableHeader } from './AdminTableHeader';

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

const LONG_TITLE =
  'Creators claimed through the spring partner programme and the label showcase follow-up';
const LONG_SUBTITLE =
  '1,204 profiles claimed this month across every acquisition channel, including the partner programme, the label showcase follow-up, organic search and direct outreach from the outbound queue.';

/** State coverage for the admin table header. */
const meta = {
  title: 'Features/Admin/AdminTableHeader States',
  component: AdminTableHeader,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Creators',
    subtitle: '1,204 profiles claimed this month',
    actions: (
      <Button size='sm' variant='secondary'>
        Export
      </Button>
    ),
  },
} satisfies Meta<typeof AdminTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no actions, so the title and subtitle own the whole row. */
export const PartialWithoutActions: Story = {
  args: { actions: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Creators')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Long content: a long title and subtitle beside the actions. */
export const LongContentCopy: Story = {
  args: { title: LONG_TITLE, subtitle: LONG_SUBTITLE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_TITLE)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Export' })).toBeVisible();
  },
};

/** Right-to-left: the copy leads from the right, actions sit on the left. */
export const RtlHeader: Story = {
  args: { title: 'المبدعون', subtitle: 'تمت المطالبة بـ 1,204 ملفًا هذا الشهر' },
  decorators: [RtlDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('المبدعون')).toBeVisible();
  },
};
