import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { LogoLink } from './LogoLink';

const meta: Meta<typeof LogoLink> = {
  title: 'Atoms/LogoLink',
  component: LogoLink,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    logoSize: {
      control: { type: 'select' },
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: '/',
    logoSize: 'sm',
  },
};

export const ExtraSmall: Story = {
  args: {
    href: '/',
    logoSize: 'xs',
  },
};

export const Medium: Story = {
  args: {
    href: '/',
    logoSize: 'md',
  },
};

export const Large: Story = {
  args: {
    href: '/',
    logoSize: 'lg',
  },
};

export const ExtraLarge: Story = {
  args: {
    href: '/',
    logoSize: 'xl',
  },
};

export const CustomHref: Story = {
  args: {
    href: APP_ROUTES.DASHBOARD_OVERVIEW,
    logoSize: 'sm',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex flex-col gap-6 items-center'>
      <div className='text-center'>
        <p className='text-sm text-gray-600 mb-2'>Extra Small</p>
        <LogoLink logoSize='xs' />
      </div>
      <div className='text-center'>
        <p className='text-sm text-gray-600 mb-2'>Small</p>
        <LogoLink logoSize='sm' />
      </div>
      <div className='text-center'>
        <p className='text-sm text-gray-600 mb-2'>Medium</p>
        <LogoLink logoSize='md' />
      </div>
      <div className='text-center'>
        <p className='text-sm text-gray-600 mb-2'>Large</p>
        <LogoLink logoSize='lg' />
      </div>
      <div className='text-center'>
        <p className='text-sm text-gray-600 mb-2'>Extra Large</p>
        <LogoLink logoSize='xl' />
      </div>
    </div>
  ),
};

export const InHeader: Story = {
  render: () => (
    <div className='bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 w-full p-4'>
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <LogoLink logoSize='sm' />
        <div className='text-sm text-gray-600'>Header Context</div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
