import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthBranding } from './AuthBranding';

const meta: Meta<typeof AuthBranding> = {
  title: 'Auth/AuthBranding',
  component: AuthBranding,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    gradientVariant: {
      control: 'select',
      options: [
        'blue-purple-cyan',
        'purple-cyan-blue',
        'purple-pink-orange',
        'green-blue-purple',
        'red-orange-yellow',
      ],
    },
    showText: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof AuthBranding>;

export const Default: Story = {
  args: {
    title: 'Welcome to Jovie',
    description: 'Create your artist profile and connect with fans worldwide.',
    gradientVariant: 'blue-purple-cyan',
    showText: true,
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen'>
        <Story />
        <div className='flex-1 bg-white dark:bg-gray-900' />
      </div>
    ),
  ],
};

export const SignIn: Story = {
  args: {
    title: 'Welcome Back',
    description:
      'Sign in to manage your profile and connect with your audience.',
    gradientVariant: 'purple-cyan-blue',
    showText: true,
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen'>
        <Story />
        <div className='flex-1 bg-white dark:bg-gray-900' />
      </div>
    ),
  ],
};

export const SignUp: Story = {
  args: {
    title: 'Join Jovie',
    description: 'Create your free artist profile in minutes.',
    gradientVariant: 'purple-pink-orange',
    showText: true,
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen'>
        <Story />
        <div className='flex-1 bg-white dark:bg-gray-900' />
      </div>
    ),
  ],
};

export const LogoOnly: Story = {
  args: {
    title: '',
    description: '',
    gradientVariant: 'green-blue-purple',
    showText: false,
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen'>
        <Story />
        <div className='flex-1 bg-white dark:bg-gray-900' />
      </div>
    ),
  ],
};

export const AllGradients: Story = {
  render: () => (
    <div className='grid grid-cols-5 min-h-screen'>
      <div className='bg-linear-to-br from-blue-600 via-purple-600 to-cyan-600 p-8 flex items-center justify-center'>
        <span className='text-white font-medium text-sm'>blue-purple-cyan</span>
      </div>
      <div className='bg-linear-to-br from-purple-600 via-cyan-600 to-blue-600 p-8 flex items-center justify-center'>
        <span className='text-white font-medium text-sm'>purple-cyan-blue</span>
      </div>
      <div className='bg-linear-to-br from-purple-600 via-pink-600 to-orange-600 p-8 flex items-center justify-center'>
        <span className='text-white font-medium text-sm'>
          purple-pink-orange
        </span>
      </div>
      <div className='bg-linear-to-br from-green-600 via-blue-600 to-purple-600 p-8 flex items-center justify-center'>
        <span className='text-white font-medium text-sm'>
          green-blue-purple
        </span>
      </div>
      <div className='bg-linear-to-br from-red-600 via-orange-600 to-yellow-600 p-8 flex items-center justify-center'>
        <span className='text-white font-medium text-sm'>
          red-orange-yellow
        </span>
      </div>
    </div>
  ),
};
