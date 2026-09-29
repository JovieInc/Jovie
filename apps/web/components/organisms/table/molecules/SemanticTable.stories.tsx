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
