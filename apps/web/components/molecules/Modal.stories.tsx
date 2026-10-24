import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { Modal } from './Modal';

const meta = {
  title: 'Molecules/Modal',
  component: Modal,
  parameters: { layout: 'fullscreen' },
  args: {
    'aria-label': 'Example dialog',
    onDismiss: fn(),
    children: <button type='button'>Continue</button>,
  },
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
const longDialogParagraphs = Array.from(
  { length: 24 },
  (_, index) => `Long dialog content ${index + 1}`
);

export const LongContent: Story = {
  args: {
    children: (
      <div className='space-y-4'>
        {longDialogParagraphs.map(paragraph => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <button type='button'>Continue</button>
      </div>
    ),
  },
};
