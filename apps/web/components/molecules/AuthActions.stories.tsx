import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthActions } from './AuthActions';

const meta: Meta<typeof AuthActions> = {
  title: 'Molecules/AuthActions',
  component: AuthActions,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};
