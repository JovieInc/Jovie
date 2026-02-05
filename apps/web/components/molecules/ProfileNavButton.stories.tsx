import type { Meta, StoryObj } from '@storybook/react';
import { ProfileNavButton } from './ProfileNavButton';

const meta: Meta<typeof ProfileNavButton> = {
  title: 'Molecules/ProfileNavButton',
  component: ProfileNavButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Navigation button for profile pages. Shows Jovie icon on main profile (links to homepage) and back arrow on sub-pages (listen, tip, etc.).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    showBackButton: {
      control: 'boolean',
      description: 'When true, shows back arrow; when false, shows Jovie icon',
    },
    artistHandle: {
      control: 'text',
      description: 'The artist handle for back navigation',
    },
  },
  decorators: [
    Story => (
      <div className='relative w-32 h-32 bg-gray-100 dark:bg-gray-900 rounded-lg'>
        <div className='absolute top-4 left-4'>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProfileNavButton>;

export const JovieIcon: Story = {
  args: {
    showBackButton: false,
    artistHandle: 'testartist',
  },
  parameters: {
    docs: {
      description: {
        story:
          'On the main profile page, shows the Jovie icon which links to the homepage.',
      },
    },
  },
};

export const BackButton: Story = {
  args: {
    showBackButton: true,
    artistHandle: 'testartist',
  },
  parameters: {
    docs: {
      description: {
        story:
          'On sub-pages (listen, tip, notifications), shows a back arrow that navigates to the main profile.',
      },
    },
  },
};

export const DarkMode: Story = {
  args: {
    showBackButton: false,
    artistHandle: 'testartist',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <div className='dark relative w-32 h-32 bg-gray-900 rounded-lg'>
        <div className='absolute top-4 left-4'>
          <Story />
        </div>
      </div>
    ),
  ],
};
