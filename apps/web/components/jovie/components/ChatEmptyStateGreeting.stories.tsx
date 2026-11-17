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
export const Empty: Story = {};

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

/** A long artist name and a long summary wrap without pushing the link off. */
export const LongContent: Story = {
  args: {
    firstName: 'Wolfgang Amadeus Maximilian Featherstonehaugh-Cholmondeley',
    result: {
      id: 'draft-long',
      item: {
        kind: 'release',
        id: 'release-long',
        label: 'The Night We Drove Down Every Coastal Highway Until Sunrise',
      },
      result: {
        kind: 'draft',
        summary:
          'Your playlist pitch for The Night We Drove Down Every Coastal Highway Until Sunrise is ready, with three curator matches.',
        href: '/app/chat',
      },
    },
  },
};

/** Right-to-left text keeps the greeting and link aligned to the start edge. */
export const Rtl: Story = {
  args: {
    firstName: 'ليلى',
    result: {
      id: 'finding-rtl',
      item: { kind: 'release', id: 'release-rtl', label: 'قمر' },
      result: {
        kind: 'finding',
        summary: 'وجد جوفي ثلاث قوائم تشغيل جديدة لأغنية قمر.',
        href: '/app/chat',
      },
    },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
