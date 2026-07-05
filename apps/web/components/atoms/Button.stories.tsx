import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof Button> = {
  title: 'UI/Atoms/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Use for interactive elements. For decorative uses that should not convey button semantics, render a <span> or <div> styled like a button.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'tertiary', 'ghost', 'link'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'icon'],
    },
    destructive: {
      control: { type: 'boolean' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: 'Primary',
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary',
    variant: 'secondary',
  },
};

export const Tertiary: Story = {
  args: {
    children: 'Tertiary',
    variant: 'tertiary',
  },
};

export const Ghost: Story = {
  args: {
    children: 'Ghost',
    variant: 'ghost',
  },
};

export const Link: Story = {
  args: {
    children: 'Link',
    variant: 'link',
  },
};

export const Destructive: Story = {
  args: {
    children: 'Delete',
    destructive: true,
    variant: 'primary',
  },
};

export const Large: Story = {
  args: {
    children: 'Large',
    size: 'lg',
  },
};

export const Medium: Story = {
  args: {
    children: 'Medium',
    size: 'md',
  },
};

export const Small: Story = {
  args: {
    children: 'Small',
    size: 'sm',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Button',
    disabled: true,
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-4 p-8'>
      <div>
        <h3 className='mb-2 font-semibold text-sm'>Canonical Variants</h3>
        <div className='flex flex-wrap gap-2'>
          <Button variant='primary'>Primary</Button>
          <Button variant='secondary'>Secondary</Button>
          <Button variant='tertiary'>Tertiary</Button>
          <Button variant='ghost'>Ghost</Button>
          <Button variant='link'>Link</Button>
        </div>
      </div>

      <div>
        <h3 className='mb-2 font-semibold text-sm'>Destructive Tone</h3>
        <div className='flex flex-wrap gap-2'>
          <Button destructive variant='primary'>
            Primary
          </Button>
          <Button destructive variant='secondary'>
            Secondary
          </Button>
          <Button destructive variant='tertiary'>
            Tertiary
          </Button>
          <Button destructive variant='ghost'>
            Ghost
          </Button>
          <Button destructive variant='link'>
            Link
          </Button>
        </div>
      </div>

      <div>
        <h3 className='mb-2 font-semibold text-sm'>Sizes</h3>
        <div className='flex flex-wrap items-center gap-2'>
          <Button size='sm'>Small</Button>
          <Button size='md'>Medium</Button>
          <Button size='lg'>Large</Button>
          <Button aria-label='Icon button' size='icon'>
            +
          </Button>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
