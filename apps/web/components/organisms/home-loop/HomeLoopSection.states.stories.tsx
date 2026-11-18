import '@/app/globals.css';
import type { ReactNode } from 'react';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { HomeLoopSection } from './HomeLoopSection';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-72'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for one Home loop section. The canonical stories stay in
 * HomeLoopSection.stories.tsx; these use the same args and add a source
 * notice, long copy and the document direction.
 */
const meta = {
  title: 'Organisms/HomeLoop/HomeLoopSection States',
  component: HomeLoopSection,
  parameters: { layout: 'padded' },
  args: {
    title: 'In Flight',
    count: 3,
    status: 'ready',
    isEmpty: false,
    emptyLabel: 'No work in flight.',
    errorLabel: 'Shipping data could not load.',
    onRetry: fn(),
    skeleton: <p className='text-xs text-tertiary-token'>Loading</p>,
    testId: 'story-section',
    children: <p className='text-sm text-primary-token'>Section body</p>,
  },
} satisfies Meta<typeof HomeLoopSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: some sources failed, so a notice with a link sits above the rows that did load. */
export const PartialSourceNotice: Story = {
  args: {
    notice: '3 sources are unavailable or missing evidence.',
    noticeHref: '/app/ov/inbox',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(
      '3 sources are unavailable'
    );
  },
};

/** Long content: a long title, a large count and a long error line wrap in place. */
export const LongContentError: Story = {
  args: {
    title: 'Blocked On You Across Every Connected Workspace',
    count: 1284,
    status: 'error',
    errorLabel:
      'Decisions could not load because three of the connected sources timed out and the fourth returned a partial page.',
  },
  decorators: [Frame],
};

/** Right-to-left: a populated section inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    title: 'قيد التنفيذ',
    children: <p className='text-sm text-primary-token'>ثلاثة طلبات</p>,
  },
  decorators: [RtlFrame],
};
