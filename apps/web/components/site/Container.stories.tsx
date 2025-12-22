import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Container } from './Container';

const meta: Meta<typeof Container> = {
  title: 'Site/Container',
  component: Container,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Container>;

const SampleContent = () => (
  <div className='bg-surface-1 border border-subtle rounded-lg p-6'>
    <h2 className='text-xl font-bold mb-2'>Container Content</h2>
    <p className='text-secondary'>
      This content is wrapped in a Container component that provides consistent
      horizontal padding and max-width constraints.
    </p>
  </div>
);

export const Small: Story = {
  args: {
    size: 'sm',
    children: <SampleContent />,
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
    children: <SampleContent />,
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: <SampleContent />,
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
    children: <SampleContent />,
  },
};

export const Full: Story = {
  args: {
    size: 'full',
    children: <SampleContent />,
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='space-y-8 py-8'>
      <Container size='sm'>
        <div className='bg-blue-100 dark:bg-blue-900 p-4 rounded-lg text-center'>
          <p className='font-medium'>Small (max-w-3xl)</p>
        </div>
      </Container>
      <Container size='md'>
        <div className='bg-green-100 dark:bg-green-900 p-4 rounded-lg text-center'>
          <p className='font-medium'>Medium (max-w-5xl)</p>
        </div>
      </Container>
      <Container size='lg'>
        <div className='bg-yellow-100 dark:bg-yellow-900 p-4 rounded-lg text-center'>
          <p className='font-medium'>Large (max-w-6xl)</p>
        </div>
      </Container>
      <Container size='xl'>
        <div className='bg-purple-100 dark:bg-purple-900 p-4 rounded-lg text-center'>
          <p className='font-medium'>Extra Large (max-w-7xl)</p>
        </div>
      </Container>
    </div>
  ),
};
