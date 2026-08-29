import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NotFoundPageContent } from './NotFoundPageContent';

const meta = {
  title: 'Site/NotFoundPageContent',
  component: NotFoundPageContent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Route-owned 404 copy and recovery actions rendered on the public shell without route-local token or numeric-ID drift.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NotFoundPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProfileMiss: Story = {
  args: {
    variant: 'profile-miss',
    surface: 'profile',
  },
  decorators: [
    Story => (
      <div className='min-h-80 bg-base p-8 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export const GenericRoot: Story = {
  args: {
    variant: 'generic',
    surface: 'root',
  },
  decorators: [
    Story => (
      <div className='min-h-80 bg-base p-8 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};
