import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableCell } from './TableCell';

const meta = {
  title: 'Organisms/Table/Atoms/TableCell',
  component: TableCell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TableCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <table>
      <tbody>
        <tr>
          <TableCell>Release title</TableCell>
          <TableCell align='right'>42</TableCell>
        </tr>
      </tbody>
    </table>
  ),
};

export const SecondaryTone: Story = {
  render: () => (
    <table>
      <tbody>
        <tr>
          <TableCell className='text-secondary-token'>Secondary row</TableCell>
        </tr>
      </tbody>
    </table>
  ),
};
