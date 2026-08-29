import type { Meta, StoryObj } from '@storybook/react';
import { Avatar } from './Avatar';

const meta: Meta<typeof Avatar> = {
  title: 'Atoms/Avatar',
  component: Avatar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Unified Avatar component for display-only usage with optimized loading, fallback states, and accessibility support.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'],
      description: 'Avatar size',
    },
    shape: {
      control: 'select',
      options: ['person', 'artwork'],
      description:
        'Person avatars are circular; release artwork is rounded-square',
    },
    src: {
      control: 'text',
      description: 'Avatar image source URL',
    },
    name: {
      control: 'text',
      description: 'Display name for fallback initials',
    },
    alt: {
      control: 'text',
      description: 'Alt text for the image',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default avatar with image
export const Default: Story = {
  args: {
    src: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
    alt: 'John Doe',
    name: 'John Doe',
    size: 'md',
    shape: 'person',
  },
};

// Fallback with initials
export const Fallback: Story = {
  args: {
    src: null,
    alt: 'Jane Smith',
    name: 'Jane Smith',
    size: 'md',
    shape: 'person',
  },
  parameters: {
    docs: {
      description: {
        story: 'Avatar with no image source, showing fallback initials.',
      },
    },
  },
};

// Different sizes
export const Sizes: Story = {
  render: () => (
    <div className='flex items-center space-x-4'>
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Avatar'
        name='John'
        size='xs'
      />
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Avatar'
        name='John'
        size='sm'
      />
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Avatar'
        name='John'
        size='md'
      />
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Avatar'
        name='John'
        size='lg'
      />
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Avatar'
        name='John'
        size='xl'
      />
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Avatar'
        name='John'
        size='2xl'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Avatar sizes from the canonical contract: xs (16px), sm (20px), md (24px), lg (32px), xl (40px), 2xl (96px).',
      },
    },
  },
};

export const PersonAndArtwork: Story = {
  render: () => (
    <div className='flex items-center space-x-4'>
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Artist'
        name='John'
        size='2xl'
        shape='person'
      />
      <Avatar
        src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face'
        alt='Release artwork'
        name='Midnight Echo'
        size='2xl'
        shape='artwork'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Person avatars stay circular. Release artwork uses the rounded-square crop.',
      },
    },
  },
};

// Fallback initials with different names
export const FallbackInitials: Story = {
  render: () => (
    <div className='flex items-center space-x-4'>
      <Avatar src={null} alt='John Doe' name='John Doe' />
      <Avatar src={null} alt='Jane Smith' name='Jane Smith' />
      <Avatar src={null} alt='Alex Johnson' name='Alex Johnson' />
      <Avatar src={null} alt='Maria Garcia' name='Maria Garcia' />
      <Avatar src={null} alt='Single Name' name='Single' />
      <Avatar src={null} alt='No Name' name='' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Avatar fallback states showing initials generated from different name formats.',
      },
    },
  },
};

// Error state (broken image URL)
export const ErrorState: Story = {
  args: {
    src: 'https://broken-url.example.com/image.jpg',
    alt: 'Broken Image',
    name: 'Error Test',
    size: 'lg',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Avatar with a broken image URL, demonstrating the error fallback to initials.',
      },
    },
  },
};

// High priority loading
export const HighPriority: Story = {
  args: {
    src: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    alt: 'Priority Avatar',
    name: 'Priority User',
    priority: true,
    size: 'lg',
  },
  parameters: {
    docs: {
      description: {
        story: 'Avatar with high priority loading for above-the-fold content.',
      },
    },
  },
};
