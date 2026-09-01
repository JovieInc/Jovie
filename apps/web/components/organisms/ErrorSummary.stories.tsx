import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ErrorSummary } from './ErrorSummary';

const meta = {
  title: 'Organisms/ErrorSummary',
  component: ErrorSummary,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[24rem] max-w-[90vw]'>
        <Story />
      </div>
    ),
  ],
  args: {
    errors: {
      name: 'Artist name is required',
      tagline: 'Tagline must be less than 160 characters',
    },
    onFocusField: () => undefined,
  },
} satisfies Meta<typeof ErrorSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleFields: Story = {};

export const SingleField: Story = {
  args: {
    errors: {
      name: 'Artist name is required',
    },
  },
};
