import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableDependencyGuide } from './TableDependencyGuide';

const meta = {
  title: 'Organisms/Table/Atoms/TableDependencyGuide',
  component: TableDependencyGuide,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='flex h-11 w-64 items-stretch'>
        <Story />
        <span className='self-center'>Child asset</span>
      </div>
    ),
  ],
} satisfies Meta<typeof TableDependencyGuide>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Continuing: Story = { args: { last: false } };
export const LastChild: Story = { args: { last: true } };
