import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ValidationStatusIcon } from './ValidationStatusIcon';

const meta: Meta<typeof ValidationStatusIcon> = {
  title: 'Organisms/SmartHandleInput/ValidationStatusIcon',
  component: ValidationStatusIcon,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ValidationStatusIcon>;

export const Checking: Story = {
  args: {
    showAvailability: true,
    checking: true,
    available: false,
    clientValid: true,
    hasError: false,
  },
};

export const Available: Story = {
  args: {
    showAvailability: true,
    checking: false,
    available: true,
    clientValid: true,
    hasError: false,
  },
};

export const Invalid: Story = {
  args: {
    showAvailability: true,
    checking: false,
    available: false,
    clientValid: false,
    hasError: true,
  },
};
