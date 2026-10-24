import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HomeLoopSection } from './HomeLoopSection';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopSection',
  component: HomeLoopSection,
  parameters: { layout: 'padded' },
  args: {
    title: 'In Flight',
    count: 3,
    status: 'ready',
    isEmpty: false,
    emptyLabel: 'No work in flight.',
    errorLabel: 'Shipping data could not load.',
    onRetry: fn(),
    skeleton: <p className='text-xs text-tertiary-token'>Loading</p>,
    testId: 'story-section',
    children: <p className='text-sm text-primary-token'>Section body</p>,
  },
} satisfies Meta<typeof HomeLoopSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { isEmpty: true } };
export const Loading: Story = { args: { status: 'loading' } };
export const ErrorState: Story = { args: { status: 'error' } };
