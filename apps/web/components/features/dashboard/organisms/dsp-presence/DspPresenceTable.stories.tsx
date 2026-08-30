import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspPresenceTable } from './DspPresenceTable';

const meta = {
  title: 'Features/Dashboard/Organisms/DspPresence/DspPresenceTable',
  component: DspPresenceTable,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['items', 'selectedMatchId', 'onRowSelect'],
    },
  },
} satisfies Meta<typeof DspPresenceTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
