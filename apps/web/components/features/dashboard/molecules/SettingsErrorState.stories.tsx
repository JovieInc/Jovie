import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsErrorState } from './SettingsErrorState';

const meta = {
  title: 'Dashboard/Molecules/SettingsErrorState',
  component: SettingsErrorState,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-96'>
      <SettingsErrorState {...args} />
    </div>
  ),
} satisfies Meta<typeof SettingsErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithRetry: Story = {
  args: {
    onRetry: () => {},
  },
};

export const CustomCopy: Story = {
  args: {
    title: 'Could not load contacts',
    message: 'Check your connection and try again.',
    onRetry: () => {},
  },
};
