import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthFormContainer } from './AuthFormContainer';
import { AuthLayout } from './AuthLayout';

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
      {
        // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
        <label className='text-sm font-medium text-primary-token'>Email</label>
      }
      <input
        type='email'
        placeholder='you@example.com'
        className='w-full px-3 py-2 border border-subtle rounded-xl bg-surface-0 text-primary-token placeholder:text-tertiary-token'
      />
    </div>
    <button
      type='button'
      className='w-full py-2 bg-btn-primary text-btn-primary-foreground rounded-xl font-medium'
    >
      Continue
    </button>
  </div>
);

export const SignIn: Story = {
  render: () => (
    <AuthLayout
      formTitle='Sign in'
      showFormTitle={false}
      showFooterPrompt={false}
    >
      <AuthFormContainer>
        <SampleForm />
      </AuthFormContainer>
    </AuthLayout>
  ),
};

export const SignUp: Story = {
  render: () => (
    <AuthLayout
      formTitle='Create your account'
      showFormTitle={false}
      showFooterPrompt={false}
      chrome='splash-b'
    >
      <AuthFormContainer>
        <SampleForm />
      </AuthFormContainer>
    </AuthLayout>
  ),
};

export const SplitShell: Story = {
  render: () => (
    <AuthLayout
      formTitle='Sign in'
      showFormTitle={false}
      showFooterPrompt={false}
      layoutVariant='split'
    >
      <AuthFormContainer>
        <SampleForm />
      </AuthFormContainer>
    </AuthLayout>
  ),
};
