import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OperatorMobileNavigation } from './OperatorMobileNavigation';

const meta = {
  title: 'Organisms/OperatorMobileNavigation',
  component: OperatorMobileNavigation,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='relative h-32 bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OperatorMobileNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
