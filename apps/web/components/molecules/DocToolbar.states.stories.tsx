import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { DocToolbar } from './DocToolbar';

function RtlToolbarDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Molecules/DocToolbar/States',
  component: DocToolbar,
  parameters: { layout: 'centered' },
  args: { pdfTitle: 'Jovie Terms of Service' },
} satisfies Meta<typeof DocToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no document title; the toolbar still offers both actions. */
export const EmptyTitle: Story = {
  args: { pdfTitle: '' },
};

/** RTL: the toolbar in a right-to-left document. */
export const RtlToolbar: Story = {
  args: { pdfTitle: 'شروط الخدمة' },
  decorators: [RtlToolbarDecorator],
};
