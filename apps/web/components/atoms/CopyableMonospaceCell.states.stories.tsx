import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyableMonospaceCell } from './CopyableMonospaceCell';

const RtlDecorator: Decorator = Story => (
  <div dir='rtl' lang='ar'>
    <Story />
  </div>
);

const meta = {
  title: 'Atoms/CopyableMonospaceCell/States',
  component: CopyableMonospaceCell,
  args: { value: 'USRC17607839', label: 'ISRC' },
} satisfies Meta<typeof CopyableMonospaceCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PartialCompact: Story = { args: { size: 'sm' } };
export const LongContent: Story = {
  args: { value: 'USRC17607839-EXTENDED-CATALOG-ID', maxWidth: 80 },
};
export const Rtl: Story = {
  args: { label: 'المعرف', value: 'USRC17607839' },
  decorators: [RtlDecorator],
};
