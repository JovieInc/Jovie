import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityChip } from './EntityChip';
import { EntityChipPopover } from './EntityChipPopover';

const meta = {
  title: 'Jovie/EntityChipPopover',
  component: EntityChipPopover,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-8'>
        <Story />
      </div>
    ),
  ],
  args: {
    kind: 'release',
    id: 'rel_1',
    label: 'Midnight Drive',
    children: (
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Midnight Drive' }}
        variant='transcript'
      />
    ),
  },
} satisfies Meta<typeof EntityChipPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LabelOnly: Story = {};
