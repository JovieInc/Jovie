import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RichTextEditor } from './RichTextEditor';

const content = {
  type: 'doc' as const,
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'The first thirty seconds' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Open on the moment the room changes, then explain why.',
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Show the concrete detail.' }],
            },
          ],
        },
      ],
    },
  ],
};

const meta = {
  title: 'Organisms/RichTextEditor',
  component: RichTextEditor,
  parameters: {
    layout: 'padded',
    jovie: {
      uncoveredProps: ['editor', 'onPress', 'disabled'],
    },
  },
  tags: ['autodocs'],
  args: {
    content,
    ariaLabel: 'Script Body',
    placeholder: 'Write the next beat…',
    statusLabel: 'Saved',
    statusTone: 'success',
    onChange: () => {},
  },
  decorators: [
    Story => (
      <div className='mx-auto w-full max-w-3xl'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RichTextEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Document: Story = {};

export const SaveFailure: Story = {
  args: {
    statusLabel: 'Not saved',
    statusTone: 'error',
    statusAction: { label: 'Retry', onClick: () => {} },
  },
};
