import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PersonCell, PersonCellSkeleton } from './PersonCell';

const meta = {
  title: 'Organisms/Table/Atoms/PersonCell',
  component: PersonCell,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: {
    name: 'Maya Okafor',
    secondary: 'maya@example.com',
  },
} satisfies Meta<typeof PersonCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NameOnly: Story = {
  args: {
    secondary: null,
  },
};

export const Verified: Story = {
  args: {
    secondary: '@maya',
    verified: true,
  },
};

export const Anonymous: Story = {
  args: {
    name: 'Anonymous Fan',
    secondary: null,
    anonymous: true,
  },
};

export const WithTrailingGlyph: Story = {
  args: {
    trailing: (
      <span
        title='Subscribed'
        className='block h-1.5 w-1.5 rounded-full bg-accent'
      />
    ),
  },
};

export const Truncated: Story = {
  args: {
    name: 'Alexandria Constantinople-Whitfield',
    secondary: 'alexandria.constantinople@example-records.com',
  },
};

export const Loading: Story = {
  render: () => <PersonCellSkeleton width='240px' />,
};
