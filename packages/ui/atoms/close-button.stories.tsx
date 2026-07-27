import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CloseButtonIcon, closeButtonClassName } from './close-button';

/**
 * Mock dialog surface — `closeButtonClassName` positions the button
 * absolutely in the top-right corner of its nearest relative ancestor.
 */
function DemoDialog({ disabled = false }: { readonly disabled?: boolean }) {
  return (
    <div className='relative h-40 w-72 rounded-xl border border-subtle bg-surface-0 p-4 shadow-lg'>
      <p className='text-sm font-medium'>Dialog title</p>
      <p className='mt-1 text-xs text-secondary-token'>
        The shared close button sits in the top-right corner.
      </p>
      <button
        type='button'
        className={closeButtonClassName}
        disabled={disabled}
      >
        <CloseButtonIcon />
      </button>
    </div>
  );
}

const meta: Meta<typeof CloseButtonIcon> = {
  title: 'UI/Atoms/CloseButton',
  component: CloseButtonIcon,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Shared close button for Dialog, AlertDialog, and Sheet. `closeButtonClassName` provides the positioning and interaction styles; `CloseButtonIcon` renders the X icon with screen-reader text.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'number' },
      description: 'Size of the X icon (tailwind spacing units)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <DemoDialog />,
};

export const Disabled: Story = {
  render: () => <DemoDialog disabled />,
  parameters: {
    docs: {
      description: {
        story:
          'Disabled state — pointer events are removed via `disabled:pointer-events-none` in the shared styles.',
      },
    },
  },
};

export const IconSizes: Story = {
  render: () => (
    <div className='flex items-center gap-6'>
      <div className='flex flex-col items-center gap-2'>
        <CloseButtonIcon size={4} />
        <span className='text-xs text-secondary-token'>size 4 (default)</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <CloseButtonIcon size={6} />
        <span className='text-xs text-secondary-token'>size 6</span>
      </div>
    </div>
  ),
};
