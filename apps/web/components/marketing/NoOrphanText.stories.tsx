import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NoOrphanText } from './NoOrphanText';

const meta: Meta<typeof NoOrphanText> = {
  title: 'Marketing/Primitives/NoOrphanText',
  component: NoOrphanText,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const FinalTwoWordsBound: Story = {
  args: { children: 'Built To Stay Out Of The Way.' },
};
