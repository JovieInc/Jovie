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
    <div className='relative h-40 w-72 rounded-xl border border-subtle bg-surface-1 p-5'>
      <p className='font-medium text-primary-token'>Entity details</p>
      <p className='mt-2 text-sm text-secondary-token'>
        Close controls share one target, radius, and focus treatment.
      </p>
      <button type='button' className={closeButtonClassName} aria-label='Close'>
        <CloseButtonIcon />
      </button>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className='relative h-28 w-64 rounded-xl border border-subtle bg-surface-1'>
      <button
        type='button'
        className={closeButtonClassName}
        disabled
        aria-label='Close'
      >
        <CloseButtonIcon />
      </button>
    </div>
  ),
};

export const IconSizes: Story = {
  render: () => (
    <div className='flex items-center gap-3 text-secondary-token'>
      {[3, 4, 5].map(size => (
        <button
          key={size}
          type='button'
          className='inline-flex size-12 items-center justify-center rounded-full border border-subtle hover:bg-interactive-hover hover:text-primary-token'
          aria-label={`Close with ${size * 4} pixel icon`}
        >
          <CloseButtonIcon size={size} />
        </button>
      ))}
    </div>
  ),
};
