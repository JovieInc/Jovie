import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthenticatedAuthEntryGuard } from './AuthenticatedAuthEntryGuard';

const meta = {
  title: 'Auth/AuthenticatedAuthEntryGuard',
  component: AuthenticatedAuthEntryGuard,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup' },
    },
  },
} satisfies Meta<typeof AuthenticatedAuthEntryGuard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {
  args: {
    children: (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        Sign-up form
      </div>
    ),
  },
};
