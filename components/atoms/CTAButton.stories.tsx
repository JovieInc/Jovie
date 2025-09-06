import { ArrowRightIcon } from '@heroicons/react/24/solid';
import type { Meta, StoryObj } from '@storybook/react';
import { CTAButton } from './CTAButton';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { useNotifications } from '@/lib/hooks/useNotifications';

const meta: Meta<typeof CTAButton> = {
  title: 'Atoms/CTAButton',
  component: CTAButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A high-quality Call-to-Action button with multiple states and animations.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'outline', 'white'],
      description: 'Visual style variant',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Size variant',
    },
    isLoading: {
      control: { type: 'boolean' },
      description: 'Whether the button is in a loading state',
    },
    isSuccess: {
      control: { type: 'boolean' },
      description: 'Whether the button is in a success state',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the button is disabled',
    },
    external: {
      control: { type: 'boolean' },
      description: 'Whether the link should open in a new tab',
    },
    reducedMotion: {
      control: { type: 'boolean' },
      description: 'Whether to use reduced motion for animations',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Base story with default props
export const Default: Story = {
  args: {
    href: '/dashboard',
    children: 'Get Started',
    variant: 'primary',
    size: 'md',
  },
};

// Variant stories
export const Primary: Story = {
  args: {
    ...Default.args,
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    ...Default.args,
    children: 'Learn More',
    variant: 'secondary',
  },
};

export const Outline: Story = {
  args: {
    ...Default.args,
    children: 'View Details',
    variant: 'outline',
  },
};

export const White: Story = {
  args: {
    ...Default.args,
    children: 'White Button',
    variant: 'white',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1f2937' },
        { name: 'light', value: '#f9fafb' },
      ],
    },
  },
};

// Size stories
export const Small: Story = {
  args: {
    ...Default.args,
    children: 'Small Button',
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    ...Default.args,
    children: 'Medium Button',
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    ...Default.args,
    children: 'Large Button',
    size: 'lg',
  },
};

// State stories
export const Loading: Story = {
  args: {
    ...Default.args,
    isLoading: true,
  },
};

export const Success: Story = {
  args: {
    ...Default.args,
    isSuccess: true,
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};

// With icon
export const WithIcon: Story = {
  args: {
    ...Default.args,
    children: 'Get Started',
    icon: <ArrowRightIcon className='h-5 w-5' />,
  },
};

// External link
export const ExternalLink: Story = {
  args: {
    ...Default.args,
    href: 'https://example.com',
    children: 'External Link',
    external: true,
  },
};

// Reduced motion
export const ReducedMotion: Story = {
  args: {
    ...Default.args,
    reducedMotion: true,
  },
};

// State transitions
export const StateTransitions: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <div className='grid grid-cols-3 gap-4'>
        <CTAButton href='/dashboard' variant='primary' size='md'>
          Idle
        </CTAButton>
        <CTAButton href='/dashboard' variant='primary' size='md' isLoading>
          Loading
        </CTAButton>
        <CTAButton href='/dashboard' variant='primary' size='md' isSuccess>
          Success
        </CTAButton>
      </div>
      <div className='grid grid-cols-3 gap-4'>
        <CTAButton href='/dashboard' variant='secondary' size='md'>
          Idle
        </CTAButton>
        <CTAButton href='/dashboard' variant='secondary' size='md' isLoading>
          Loading
        </CTAButton>
        <CTAButton href='/dashboard' variant='secondary' size='md' isSuccess>
          Success
        </CTAButton>
      </div>
      <div className='grid grid-cols-3 gap-4'>
        <CTAButton href='/dashboard' variant='outline' size='md'>
          Idle
        </CTAButton>
        <CTAButton href='/dashboard' variant='outline' size='md' isLoading>
          Loading
        </CTAButton>
        <CTAButton href='/dashboard' variant='outline' size='md' isSuccess>
          Success
        </CTAButton>
      </div>
      <div className='grid grid-cols-3 gap-4'>
        <CTAButton href='/dashboard' variant='white' size='md'>
          Idle
        </CTAButton>
        <CTAButton href='/dashboard' variant='white' size='md' isLoading>
          Loading
        </CTAButton>
        <CTAButton href='/dashboard' variant='white' size='md' isSuccess>
          Success
        </CTAButton>
      </div>
    </div>
  ),
};

// All sizes
export const AllSizes: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <CTAButton href='/dashboard' variant='primary' size='sm'>
        Small Button
      </CTAButton>
      <CTAButton href='/dashboard' variant='primary' size='md'>
        Medium Button
      </CTAButton>
      <CTAButton href='/dashboard' variant='primary' size='lg'>
        Large Button
      </CTAButton>
    </div>
  ),
};

// All variants
export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-4'>
      <CTAButton href='/dashboard' variant='primary' size='md'>
        Primary Button
      </CTAButton>
      <CTAButton href='/dashboard' variant='secondary' size='md'>
        Secondary Button
      </CTAButton>
      <CTAButton href='/dashboard' variant='outline' size='md'>
        Outline Button
      </CTAButton>
      <CTAButton href='/dashboard' variant='white' size='md'>
        White Button
      </CTAButton>
    </div>
  ),
};

// Theme comparison (light/dark)
export const ThemeComparison: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-8'>
      <div className='flex flex-col gap-4 p-6 bg-white rounded-lg'>
        <h3 className='text-lg font-semibold mb-2'>Light Theme</h3>
        <CTAButton href='/dashboard' variant='primary' size='md'>
          Primary
        </CTAButton>
        <CTAButton href='/dashboard' variant='secondary' size='md'>
          Secondary
        </CTAButton>
        <CTAButton href='/dashboard' variant='outline' size='md'>
          Outline
        </CTAButton>
        <CTAButton href='/dashboard' variant='white' size='md'>
          White
        </CTAButton>
      </div>
      <div className='flex flex-col gap-4 p-6 bg-gray-900 rounded-lg'>
        <h3 className='text-lg font-semibold mb-2 text-white'>Dark Theme</h3>
        <CTAButton href='/dashboard' variant='primary' size='md'>
          Primary
        </CTAButton>
        <CTAButton href='/dashboard' variant='secondary' size='md'>
          Secondary
        </CTAButton>
        <CTAButton href='/dashboard' variant='outline' size='md'>
          Outline
        </CTAButton>
        <CTAButton href='/dashboard' variant='white' size='md'>
          White
        </CTAButton>
      </div>
    </div>
  ),
};

// Button with onClick handler
const WithOnClickComponent = () => {
  const notifications = useNotifications();
  
  return (
    <CTAButton
      variant="primary"
      size="md"
      onClick={() => notifications.success('Button clicked! 🎉')}
    >
      Click Me
    </CTAButton>
  );
};

export const WithOnClick: Story = {
  render: () => <WithOnClickComponent />,
};

// Accessibility examples
export const AccessibilityExamples: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div>
        <h3 className='text-lg font-semibold mb-2'>With aria-label</h3>
        <CTAButton
          href='/dashboard'
          variant='primary'
          size='md'
          ariaLabel='Navigate to dashboard'
        >
          Dashboard
        </CTAButton>
      </div>
      <div>
        <h3 className='text-lg font-semibold mb-2'>
          Loading state with aria-busy
        </h3>
        <CTAButton href='/dashboard' variant='primary' size='md' isLoading>
          Loading Example
        </CTAButton>
      </div>
      <div>
        <h3 className='text-lg font-semibold mb-2'>
          Disabled state with aria-disabled
        </h3>
        <CTAButton href='/dashboard' variant='primary' size='md' disabled>
          Disabled Example
        </CTAButton>
      </div>
    </div>
  ),
};
