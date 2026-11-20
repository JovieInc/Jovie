import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableBody, TableHead, TableRoot, TableRow } from './SemanticTable';

const meta = {
  title: 'Organisms/Table/Molecules/SemanticTable',
  component: TableRoot,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TableRoot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: null },
  render: () => (
    <TableRoot className='w-96 text-sm text-primary-token'>
      <TableHead>
        <TableRow>
          <th className='px-3 py-2 text-left'>Name</th>
          <th className='px-3 py-2 text-left'>Status</th>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <td className='px-3 py-2'>Midnight EP</td>
          <td className='px-3 py-2'>Published</td>
        </TableRow>
        <TableRow>
          <td className='px-3 py-2'>Daylight Single</td>
          <td className='px-3 py-2'>Draft</td>
        </TableRow>
      </TableBody>
    </TableRoot>
  ),
};

/** Long values wrap inside the composed table without widening it. */
export const LongContent: Story = {
  args: { children: null },
  render: () => (
    <TableRoot className='w-72 text-sm text-primary-token'>
      <TableHead>
        <TableRow>
          <th className='px-3 py-2 text-left'>Name</th>
          <th className='px-3 py-2 text-left'>Status</th>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <td className='px-3 py-2'>
            Never Say A Word (Extended Club Mix) feat. a long guest list
          </td>
          <td className='px-3 py-2'>Awaiting distributor approval</td>
        </TableRow>
      </TableBody>
    </TableRoot>
  ),
};

export const Rtl: Story = {
  args: { children: null },
  render: () => (
    <div dir='rtl' lang='ar'>
      <TableRoot className='w-72 text-sm text-primary-token'>
        <TableHead>
          <TableRow>
            <th className='px-3 py-2 text-start'>الاسم</th>
            <th className='px-3 py-2 text-start'>الحالة</th>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <td className='px-3 py-2'>منتصف الليل</td>
            <td className='px-3 py-2'>منشور</td>
          </TableRow>
        </TableBody>
      </TableRoot>
    </div>
  ),
};
