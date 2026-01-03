import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LinearButton } from './LinearButton';

const meta: Meta<typeof LinearButton> = {
  title: 'Atoms/LinearButton',
  component: LinearButton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A styled link button component with primary and secondary variants.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary'],
      description: 'Visual style variant',
    },
    href: {
      control: 'text',
      description: 'Link destination',
    },
    children: {
      control: 'text',
      description: 'Button content',
    },
  },
};

export default meta;
type Story = StoryObj<typeof LinearButton>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    href: '#',
    children: 'Get Started',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    href: '#',
    children: 'Learn More',
  },
};

export const BothVariants: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <LinearButton variant='primary' href='#'>
        Primary Action
      </LinearButton>
      <LinearButton variant='secondary' href='#'>
        Secondary Action
      </LinearButton>
    </div>
  ),
};

export const WithCustomClass: Story = {
  args: {
    variant: 'primary',
    href: '#',
    children: 'Custom Styled',
    className: 'shadow-lg',
  },
};
