import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { Toast } from './Toast';

const meta: Meta<typeof Toast> = {
  title: 'UI/Toast',
  component: Toast,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
Toast notifications for user feedback. Use the useNotifications hook for easier integration.

## Keyboard Accessibility

Action buttons in toasts support full keyboard accessibility with visible focus states. This ensures keyboard-only users can easily identify and interact with toast actions.

### Focus State Behavior:
- **Focus Ring**: When tabbing to an action button, a colored focus ring appears matching the toast type's accent color.
- **Underline**: Focused action buttons display an underline for additional visual indication.
- **focus-visible**: Uses the \`focus-visible\` pseudo-class to only show focus indicators for keyboard navigation (not mouse clicks).

### Testing Focus States in Storybook:
1. Navigate to a toast story with an action button (e.g., "With Action")
2. Press **Tab** to move focus to the action button
3. The focus ring and underline will appear
4. Each toast type (info, success, warning, error) has a matching accent color for its focus ring
        `,
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <ToastProvider>
        <div className='min-h-[200px] flex items-center justify-center'>
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  argTypes: {
    type: {
      control: { type: 'select' },
      options: ['info', 'success', 'warning', 'error'],
      description: 'Visual style of the toast',
    },
    duration: {
      control: { type: 'number' },
      description:
        'Auto-dismiss duration in milliseconds (0 = no auto-dismiss)',
    },
    message: {
      control: { type: 'text' },
      description: 'Toast message content',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic toast examples
export const Info: Story = {
  args: {
    id: 'info-toast',
    message: 'This is an info message',
    type: 'info',
    duration: 5000,
  },
};

export const Success: Story = {
  args: {
    id: 'success-toast',
    message: 'Operation completed successfully!',
    type: 'success',
    duration: 4000,
  },
};

export const Warning: Story = {
  args: {
    id: 'warning-toast',
    message: 'Please review your changes before continuing',
    type: 'warning',
    duration: 5000,
  },
};

export const Error: Story = {
  args: {
    id: 'error-toast',
    message: 'Something went wrong. Please try again.',
    type: 'error',
    duration: 6000,
  },
};

// Toast with action button
/**
 * Toast with an action button. Press Tab to see the focus ring appear on the action button.
 * The focus state includes a colored ring and underline matching the toast type's accent color.
 */
export const WithAction: Story = {
  args: {
    id: 'action-toast',
    message: 'File uploaded successfully',
    type: 'success',
    duration: 0, // No auto-dismiss to allow focus testing
    action: {
      label: 'View File',
      onClick: () => console.log('View file clicked'),
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Toast with action button. Press **Tab** to focus the action button and see the focus ring. The `duration: 0` prevents auto-dismiss for easier testing.',
      },
    },
  },
};

// Demonstrating focus states for all toast types with action buttons
/**
 * Info toast with action button. Focus ring uses sky/cyan accent colors.
 */
export const InfoWithAction: Story = {
  args: {
    id: 'info-action-toast',
    message: 'New updates are available',
    type: 'info',
    duration: 0,
    action: {
      label: 'Update Now',
      onClick: () => console.log('Update clicked'),
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Info toast with action button. Tab to focus and see the **sky-colored** focus ring.',
      },
    },
  },
};

/**
 * Warning toast with action button. Focus ring uses amber/orange accent colors.
 */
export const WarningWithAction: Story = {
  args: {
    id: 'warning-action-toast',
    message: 'Your session will expire soon',
    type: 'warning',
    duration: 0,
    action: {
      label: 'Extend Session',
      onClick: () => console.log('Extend clicked'),
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Warning toast with action button. Tab to focus and see the **amber-colored** focus ring.',
      },
    },
  },
};

/**
 * Error toast with action button. Focus ring uses rose/red accent colors.
 */
export const ErrorWithAction: Story = {
  args: {
    id: 'error-action-toast',
    message: 'Failed to save changes',
    type: 'error',
    duration: 0,
    action: {
      label: 'Retry',
      onClick: () => console.log('Retry clicked'),
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Error toast with action button. Tab to focus and see the **rose-colored** focus ring.',
      },
    },
  },
};

// Interactive examples using the notifications hook
const InteractiveExample = () => {
  const notifications = useNotifications();

  return (
    <div className='flex flex-col gap-4 p-6'>
      <h3 className='text-lg font-semibold mb-4'>Interactive Toast Examples</h3>

      <div className='grid grid-cols-2 gap-4'>
        <button
          onClick={() => notifications.success('Success! Operation completed.')}
          className='px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700'
        >
          Show Success
        </button>

        <button
          onClick={() => notifications.error('Error! Something went wrong.')}
          className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700'
        >
          Show Error
        </button>

        <button
          onClick={() => notifications.warning('Warning! Please be careful.')}
          className='px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700'
        >
          Show Warning
        </button>

        <button
          onClick={() => notifications.info("Info: Here's some information.")}
          className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
        >
          Show Info
        </button>
      </div>

      <div className='grid grid-cols-2 gap-4 mt-4'>
        <button
          onClick={() =>
            notifications.undo('Item deleted', () => {
              notifications.success('Item restored!');
            })
          }
          className='px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700'
        >
          Show Undo Toast
        </button>

        <button
          onClick={() =>
            notifications.retry('Upload failed', () => {
              notifications.info('Retrying upload...');
            })
          }
          className='px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700'
        >
          Show Retry Toast
        </button>
      </div>

      <div className='grid grid-cols-2 gap-4 mt-4'>
        <button
          onClick={() => {
            const promise = new Promise(resolve => {
              setTimeout(resolve, 2000);
            });

            notifications.withLoadingToast(promise, {
              loadingMessage: 'Processing...',
              successMessage: 'Done!',
            });
          }}
          className='px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700'
        >
          Show Loading Toast
        </button>

        <button
          onClick={() => notifications.clearToasts()}
          className='px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900'
        >
          Clear All Toasts
        </button>
      </div>
    </div>
  );
};

export const Interactive: Story = {
  render: () => <InteractiveExample />,
};

// Predefined message examples
const PredefinedExample = () => {
  const notifications = useNotifications();

  return (
    <div className='flex flex-col gap-4 p-6'>
      <h3 className='text-lg font-semibold mb-4'>
        Predefined Message Examples
      </h3>

      <div className='grid grid-cols-2 gap-4'>
        <button
          onClick={() => notifications.saveSuccess()}
          className='px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700'
        >
          Save Success
        </button>

        <button
          onClick={() => notifications.saveError()}
          className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700'
        >
          Save Error
        </button>

        <button
          onClick={() => notifications.uploadSuccess()}
          className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
        >
          Upload Success
        </button>

        <button
          onClick={() => notifications.networkError()}
          className='px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700'
        >
          Network Error
        </button>
      </div>
    </div>
  );
};

export const PredefinedMessages: Story = {
  render: () => <PredefinedExample />,
};

// Error handling example
const ErrorHandlingExample = () => {
  const notifications = useNotifications();

  const simulateError = (errorType: string) => {
    let error: Error;

    switch (errorType) {
      case 'network':
        error = globalThis.Error('fetch failed');
        break;
      case 'validation':
        error = globalThis.Error('Invalid email address');
        break;
      case 'technical':
        error = globalThis.Error(
          'TypeError: Cannot read property of undefined'
        );
        break;
      default:
        error = globalThis.Error('Something went wrong');
    }

    notifications.handleError(error, 'Operation failed');
  };

  return (
    <div className='flex flex-col gap-4 p-6'>
      <h3 className='text-lg font-semibold mb-4'>Error Handling Examples</h3>

      <div className='grid grid-cols-2 gap-4'>
        <button
          onClick={() => simulateError('network')}
          className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700'
        >
          Network Error
        </button>

        <button
          onClick={() => simulateError('validation')}
          className='px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700'
        >
          Validation Error
        </button>

        <button
          onClick={() => simulateError('technical')}
          className='px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700'
        >
          Technical Error (Console Only)
        </button>

        <button
          onClick={() => simulateError('generic')}
          className='px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700'
        >
          Generic Error
        </button>
      </div>

      <p className='text-sm text-gray-600 dark:text-gray-400 mt-4'>
        Technical errors are logged to console but not shown to users. Check the
        browser console when clicking &quot;Technical Error&quot;.
      </p>
    </div>
  );
};

export const ErrorHandling: Story = {
  render: () => <ErrorHandlingExample />,
};
