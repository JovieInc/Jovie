import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyableMonospaceCell } from './CopyableMonospaceCell';

/** Rendered states of the copyable identifier cell. */
const meta = {
  title: 'Atoms/CopyableMonospaceCell/States',
  component: CopyableMonospaceCell,
  parameters: { layout: 'centered' },
  args: {
    value: 'USRC17607839',
    label: 'ISRC',
  },
} satisfies Meta<typeof CopyableMonospaceCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only the value and label, with the default size and width. */
export const PartialDefaults: Story = {};

/** Long content: a long catalog id truncates inside its maximum width. */
export const LongContentCatalogId: Story = {
  args: {
    value: 'USRC17607839-EXTENDED-CATALOG-ID-FROM-DISTRIBUTOR',
    label: 'Catalog ID',
    maxWidth: 80,
  },
};

/** Right to left: the cell inside an Arabic metadata row. */
export const RtlMetadataRow: Story = {
  args: { label: 'UPC', value: '00602577291234', size: 'sm' },
  render: function RtlCell(args) {
    return (
      <div dir='rtl' lang='ar' className='rounded-md bg-surface-1 p-3'>
        <CopyableMonospaceCell {...args} />
      </div>
    );
  },
};
