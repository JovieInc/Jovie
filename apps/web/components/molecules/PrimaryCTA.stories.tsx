import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PrimaryCTA } from './PrimaryCTA';

const meta: Meta<typeof PrimaryCTA> = {
  title: 'Molecules/PrimaryCTA',
  component: PrimaryCTA,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    size: {
      control: 'radio',
      options: ['md', 'lg'],
    },
    fullWidth: {
      control: 'boolean',
    },
    loading: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PrimaryCTA>;

export const Default: Story = {
  args: {
    children: 'Get Started',
    ariaLabel: 'Get started with Jovie',
    fullWidth: false,
  },
};

export const Large: Story = {
  args: {
    children: 'Claim Your Handle',
    ariaLabel: 'Claim your Jovie handle',
    size: 'lg',
    fullWidth: false,
  },
};

export const Medium: Story = {
  args: {
    children: 'Sign Up',
    ariaLabel: 'Sign up for Jovie',
    size: 'md',
    fullWidth: false,
  },
};

export const FullWidth: Story = {
  args: {
    children: 'Continue',
    ariaLabel: 'Continue to next step',
    fullWidth: true,
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export const Loading: Story = {
  args: {
    children: 'Saving...',
    ariaLabel: 'Save changes',
    loadingLabel: 'Saving your changes',
    loading: true,
    fullWidth: false,
  },
};

export const Disabled: Story = {
  args: {
    children: 'Submit',
    ariaLabel: 'Submit form',
    disabled: true,
    fullWidth: false,
  },
};

export const InForm: Story = {
  render: () => (
    <div className='w-80 space-y-4 p-6 border border-subtle rounded-xl'>
      <div className='space-y-2'>
        {
          // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
          <label className='text-sm font-medium'>Email</label>
        }
        <input
          type='email'
          placeholder='you@example.com'
          className='w-full px-3 py-2 border border-subtle rounded-lg'
        />
      </div>
      <PrimaryCTA ariaLabel='Subscribe to newsletter' fullWidth>
        Subscribe
      </PrimaryCTA>
    </div>
  ),
};
