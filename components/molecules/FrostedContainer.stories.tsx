import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FrostedContainer } from './FrostedContainer';

const meta: Meta<typeof FrostedContainer> = {
  title: 'Molecules/FrostedContainer',
  component: FrostedContainer,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'glass', 'solid'],
    },
    backgroundPattern: {
      control: 'select',
      options: ['grid', 'dots', 'gradient', 'none'],
    },
    showGradientBlurs: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FrostedContainer>;

const SampleContent = () => (
  <div className='p-8 max-w-md mx-auto text-center'>
    <h2 className='text-2xl font-bold mb-4'>Welcome to Jovie</h2>
    <p className='text-secondary mb-6'>
      Create your artist profile and connect with fans worldwide.
    </p>
    <button className='px-6 py-2 bg-black text-white dark:bg-white dark:text-black rounded-full font-medium'>
      Get Started
    </button>
  </div>
);

export const Default: Story = {
  args: {
    variant: 'default',
    backgroundPattern: 'grid',
    showGradientBlurs: true,
    children: <SampleContent />,
    className: 'max-w-lg mx-auto my-20',
  },
};

export const Glass: Story = {
  args: {
    variant: 'glass',
    backgroundPattern: 'gradient',
    showGradientBlurs: true,
    children: <SampleContent />,
    className: 'max-w-lg mx-auto my-20',
  },
};

export const Solid: Story = {
  args: {
    variant: 'solid',
    backgroundPattern: 'dots',
    showGradientBlurs: false,
    children: <SampleContent />,
    className: 'max-w-lg mx-auto my-20',
  },
};

export const NoBackground: Story = {
  args: {
    variant: 'default',
    backgroundPattern: 'none',
    showGradientBlurs: false,
    children: <SampleContent />,
    className: 'max-w-lg mx-auto my-20',
  },
};
