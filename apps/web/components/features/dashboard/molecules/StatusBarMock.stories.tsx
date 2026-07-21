import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBarMock } from './StatusBarMock';

const meta: Meta<typeof StatusBarMock> = {
  title: 'Dashboard/Molecules/StatusBarMock',
  component: StatusBarMock,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    className: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof StatusBarMock>;

export const Default: Story = {};

export const DarkSurface: Story = {
  args: {
    className: 'bg-black text-white',
  },
};
