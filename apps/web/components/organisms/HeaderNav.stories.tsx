import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeaderNav } from './HeaderNav';

const meta: Meta<typeof HeaderNav> = {
  title: 'Organisms/HeaderNav',
  component: HeaderNav,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
        query: {},
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story - shows the header navigation
export const Default: Story = {};

// Mobile view story
export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

// Dark theme story
export const DarkTheme: Story = {
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
  decorators: [
    Story => (
      <div className='dark bg-gray-900 min-h-screen'>
        <Story />
      </div>
    ),
  ],
};
