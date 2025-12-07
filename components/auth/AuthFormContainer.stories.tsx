import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthFormContainer } from './AuthFormContainer';

const meta: Meta<typeof AuthFormContainer> = {
  title: 'Auth/AuthFormContainer',
  component: AuthFormContainer,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AuthFormContainer>;

const SampleForm = () => (
  <div className='space-y-4'>
    <div className='space-y-2'>
      <label className='text-sm font-medium'>Email</label>
      <input
        type='email'
        placeholder='you@example.com'
        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
      />
    </div>
    <div className='space-y-2'>
      <label className='text-sm font-medium'>Password</label>
      <input
        type='password'
        placeholder='••••••••'
        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
      />
    </div>
    <button className='w-full py-2 bg-black text-white dark:bg-white dark:text-black rounded-lg font-medium'>
      Sign In
    </button>
  </div>
);

export const SignIn: Story = {
  args: {
    title: 'Sign In',
    children: <SampleForm />,
  },
  decorators: [
    Story => (
      <div className='min-h-screen bg-white dark:bg-gray-900'>
        <Story />
      </div>
    ),
  ],
};

export const SignUp: Story = {
  args: {
    title: 'Create Account',
    children: <SampleForm />,
  },
  decorators: [
    Story => (
      <div className='min-h-screen bg-white dark:bg-gray-900'>
        <Story />
      </div>
    ),
  ],
};

export const WithBranding: Story = {
  render: () => (
    <div className='flex min-h-screen'>
      <div className='hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-12 xl:px-16 bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600'>
        <div className='text-center text-white'>
          <h1 className='text-3xl font-bold mb-4'>Welcome to Jovie</h1>
          <p className='text-blue-100'>Create your artist profile today.</p>
        </div>
      </div>
      <AuthFormContainer title='Sign In'>
        <SampleForm />
      </AuthFormContainer>
    </div>
  ),
};
