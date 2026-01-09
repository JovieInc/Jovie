import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthLayout } from './AuthLayout';

const meta: Meta<typeof AuthLayout> = {
  title: 'Auth/AuthLayout',
  component: AuthLayout,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AuthLayout>;

const SampleForm = () => (
  <div className='space-y-4'>
    <div className='space-y-2'>
      {
        // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
        <label className='text-sm font-medium text-primary-token'>Email</label>
      }
      <input
        type='email'
        placeholder='you@example.com'
        className='w-full px-3 py-2 border border-subtle rounded-[--radius-xl] bg-surface-0 text-primary-token placeholder:text-tertiary-token'
      />
    </div>
    <button
      type='button'
      className='w-full py-2 bg-btn-primary text-btn-primary-foreground rounded-[--radius-xl] font-medium'
    >
      Continue
    </button>
  </div>
);

export const SignIn: Story = {
  args: {
    formTitle: 'Sign in to Jovie',
    footerPrompt: "Don't have access?",
    footerLinkText: 'Join the waitlist',
    footerLinkHref: '/waitlist',
    children: <SampleForm />,
  },
};

export const SignUp: Story = {
  args: {
    formTitle: 'Create your account',
    footerPrompt: 'Already have an account?',
    footerLinkText: 'Sign in',
    footerLinkHref: '/signin',
    children: <SampleForm />,
  },
};

export const Waitlist: Story = {
  args: {
    formTitle: 'Join the Waitlist',
    footerPrompt: 'Already have access?',
    footerLinkText: 'Sign in',
    footerLinkHref: '/signin',
    children: (
      <div className='space-y-4'>
        <div className='space-y-2'>
          {
            // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
            <label className='text-sm font-medium text-primary-token'>
              Email
            </label>
          }
          <input
            type='email'
            placeholder='you@example.com'
            className='w-full px-3 py-2 border border-subtle rounded-[--radius-xl] bg-surface-0 text-primary-token placeholder:text-tertiary-token'
          />
        </div>
        <div className='space-y-2'>
          {
            // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
            <label className='text-sm font-medium text-primary-token'>
              Desired Handle
            </label>
          }
          <input
            type='text'
            placeholder='@yourhandle'
            className='w-full px-3 py-2 border border-subtle rounded-[--radius-xl] bg-surface-0 text-primary-token placeholder:text-tertiary-token'
          />
        </div>
        <button
          type='button'
          className='w-full py-2 bg-btn-primary text-btn-primary-foreground rounded-[--radius-xl] font-medium'
        >
          Join Waitlist
        </button>
      </div>
    ),
  },
};
