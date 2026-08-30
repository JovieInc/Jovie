import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthUnavailableCard } from './AuthUnavailableCard';

const meta = {
  title: 'Auth/AuthUnavailableCard',
  component: AuthUnavailableCard,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signin' },
    },
    jovie: { uncoveredProps: ['disabled'] },
  },
} satisfies Meta<typeof AuthUnavailableCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {
  args: {
    mode: 'signin',
  },
};
