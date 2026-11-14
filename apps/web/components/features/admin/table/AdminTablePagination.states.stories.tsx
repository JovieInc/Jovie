import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import { AdminTablePagination } from './AdminTablePagination';

function SurfaceDecorator(Story: () => ReactNode) {
  return (
    <div className='bg-(--app-shell-content-surface) p-4'>
      <Story />
    </div>
  );
}

function RtlSurfaceDecorator(Story: () => ReactNode) {
  return (
    <div className='bg-(--app-shell-content-surface) p-4' dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for admin pagination. */
const meta = {
  title: 'Features/Admin/Table/AdminTablePagination States',
  component: AdminTablePagination,
  parameters: { layout: 'fullscreen' },
  args: {
    page: 2,
    totalPages: 5,
    from: 21,
    to: 40,
    total: 91,
    canPrev: true,
    canNext: true,
    onPrevClick: fn(),
    onNextClick: fn(),
    entityLabel: 'records',
  },
} satisfies Meta<typeof AdminTablePagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no results, so both directions are disabled. */
export const EmptyNoResults: Story = {
  args: {
    page: 1,
    totalPages: 1,
    from: 0,
    to: 0,
    total: 0,
    canPrev: false,
    canNext: false,
  },
  decorators: [SurfaceDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Previous Page' })
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Next Page' })
    ).toBeDisabled();
  },
};

/** Partial: page count only, with no item range and no page-size control. */
export const PartialPageOnly: Story = {
  args: {
    from: undefined,
    to: undefined,
    total: undefined,
    entityLabel: undefined,
  },
  decorators: [SurfaceDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('admin-pagination-page-count')
    ).toBeVisible();
    await expect(canvas.queryByTestId('admin-pagination-range')).toBeNull();
    await expect(canvas.queryByRole('combobox')).toBeNull();
  },
};

/** Long content: seven-digit ranges and a long entity label on one line. */
export const LongContentRange: Story = {
  args: {
    page: 48213,
    totalPages: 126044,
    from: 964241,
    to: 964260,
    total: 2520871,
    entityLabel: 'creator profiles awaiting a second fact review',
    pageSize: 20,
    onPageSizeChange: fn(),
  },
  decorators: [SurfaceDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('admin-pagination-page-count')
    ).toHaveTextContent('48213');
    await expect(
      canvas.getByRole('combobox', { name: 'Rows Per Page' })
    ).toBeVisible();
  },
};

/** Right-to-left: page info leads from the right, controls sit on the left. */
export const RtlPagination: Story = {
  args: { entityLabel: 'سجلات' },
  decorators: [RtlSurfaceDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Next Page' })
    ).toBeEnabled();
  },
};
