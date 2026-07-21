import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CloseButtonIcon, closeButtonClassName } from './close-button';

const meta: Meta = {
  title: 'UI/Atoms/CloseButton',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <button type='button' className={closeButtonClassName.join(' ')} aria-label='Close'>
      <CloseButtonIcon />
    </button>
  ),
};

export const Disabled: Story = {
  render: () => (
    <button
      type='button'
      className={closeButtonClassName.join(' ')}
      disabled
      aria-label='Close'
    >
      <CloseButtonIcon />
    </button>
  ),
};
