import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InfoPopover } from './InfoPopover';

const meta = {
  title: 'Molecules/Inspector/InfoPopover',
  component: InfoPopover,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['side', 'align', 'testId'] },
  },
  args: {
    label: 'About downloads',
    children: <p>Helper copy stays behind ⓘ.</p>,
  },
} satisfies Meta<typeof InfoPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DownloadsHelper: Story = {};
