import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatEmptyStateGreeting } from './ChatEmptyStateGreeting';

const meta = {
  title: 'Chat/EmptyState/Greeting',
  component: ChatEmptyStateGreeting,
  parameters: { layout: 'fullscreen' },
  args: {
    firstName: 'Tim',
  },
  decorators: [
    Story => (
      <div className='flex min-h-64 items-center justify-center bg-base p-6'>
        <div className='w-full max-w-2xl'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ChatEmptyStateGreeting>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing finished yet: the greeting alone, so the composer is the focus. */
export const GreetingOnly: Story = {};

/** A finished draft for a real release, with one link that opens it. */
export const WithFinishedDraft: Story = {
  args: {
    result: {
      id: 'draft-fixture',
      item: { kind: 'release', id: 'release-fixture', label: 'Wheels Up' },
      result: {
        kind: 'draft',
        summary: 'Your playlist pitch for Wheels Up is ready.',
        href: '/app/chat',
      },
    },
  },
};
