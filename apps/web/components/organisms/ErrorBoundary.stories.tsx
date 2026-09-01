import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import ErrorBoundary from './ErrorBoundary';

const defaultError = Object.assign(new Error('The page request timed out.'), {
  digest: 'error-boundary-demo',
});

const deploymentSkewError = new Error(
  'Failed to find server action for this deployment.'
);

const meta = {
  title: 'Organisms/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecoverableError: Story = {
  args: {
    error: defaultError,
    reset: fn(),
    context: 'Dashboard',
  },
};

export const DeploymentSkewError: Story = {
  args: {
    error: deploymentSkewError,
    reset: fn(),
    context: 'Dashboard',
  },
};
