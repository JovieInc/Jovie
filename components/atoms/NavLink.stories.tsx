import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NavLink } from './NavLink';

const meta: Meta<typeof NavLink> = {
  title: 'Atoms/NavLink',
  component: NavLink,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'primary'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: '/dashboard',
    children: 'Dashboard',
    variant: 'default',
  },
};

export const Primary: Story = {
  args: {
    href: '/sign-up',
    children: 'Sign Up',
    variant: 'primary',
  },
};

export const LongText: Story = {
  args: {
    href: '/about',
    children: 'About Our Company',
    variant: 'default',
  },
};

export const PrimaryLongText: Story = {
  args: {
    href: '/get-started',
    children: 'Get Started Now',
    variant: 'primary',
  },
};

export const BothVariants: Story = {
  render: () => (
    <div className='flex gap-4'>
      <NavLink href='/features' variant='default'>
        Features
      </NavLink>
      <NavLink href='/pricing' variant='default'>
        Pricing
      </NavLink>
      <NavLink href='/sign-up' variant='primary'>
        Sign Up
      </NavLink>
    </div>
  ),
};

export const NavigationBar: Story = {
  render: () => (
    <nav className='bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 w-full p-4'>
      <div className='max-w-7xl mx-auto flex items-center justify-between'>
        <div className='flex items-center space-x-1'>
          <span className='font-bold text-xl'>Jovie</span>
        </div>
        <div className='hidden md:flex items-center space-x-6'>
          <NavLink href='/features' variant='default'>
            Features
          </NavLink>
          <NavLink href='/pricing' variant='default'>
            Pricing
          </NavLink>
          <NavLink href='/about' variant='default'>
            About
          </NavLink>
          <NavLink href='/sign-up' variant='primary'>
            Sign Up
          </NavLink>
        </div>
      </div>
    </nav>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};

export const VerticalNavigation: Story = {
  render: () => (
    <div className='bg-gray-50 dark:bg-gray-900 p-6 rounded-lg'>
      <h3 className='text-lg font-semibold mb-4'>Navigation Menu</h3>
      <div className='flex flex-col space-y-2'>
        <NavLink href='/dashboard' variant='default'>
          Dashboard
        </NavLink>
        <NavLink href='/profile' variant='default'>
          Profile
        </NavLink>
        <NavLink href='/settings' variant='default'>
          Settings
        </NavLink>
        <NavLink href='/help' variant='default'>
          Help & Support
        </NavLink>
        <div className='pt-2'>
          <NavLink href='/upgrade' variant='primary'>
            Upgrade Plan
          </NavLink>
        </div>
      </div>
    </div>
  ),
};
