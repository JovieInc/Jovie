import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'shadcn/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A compact status indicator component with semantic variants, icon slots, and full accessibility support. SSR-safe and RSC-compatible.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: [
        'primary',
        'secondary',
        'outline',
        'success',
        'warning',
        'error',
        'info',
      ],
      description: 'Visual style variant',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Badge size',
    },
    startIcon: {
      control: false,
      description: 'Icon element to render before the badge text',
    },
    endIcon: {
      control: false,
      description: 'Icon element to render after the badge text',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core Variants
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

export const Outline: Story = {
  args: {
    children: 'Outline',
    variant: 'outline',
  },
};

export const Success: Story = {
  args: {
    children: 'Success',
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    children: 'Warning',
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    children: 'Error',
    variant: 'error',
  },
};

export const Info: Story = {
  args: {
    children: 'Info',
    variant: 'info',
  },
};

// Sizes
export const Small: Story = {
  args: {
    children: 'Small',
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    children: 'Medium',
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    children: 'Large',
    size: 'lg',
  },
};

// With Icons
const DotIcon = () => <span className='h-1.5 w-1.5 rounded-full bg-current' />;

const CheckIcon = () => (
  <svg
    className='h-3 w-3'
    fill='none'
    stroke='currentColor'
    viewBox='0 0 24 24'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M5 13l4 4L19 7'
    />
  </svg>
);

const XIcon = () => (
  <svg
    className='h-3 w-3'
    fill='none'
    stroke='currentColor'
    viewBox='0 0 24 24'
    aria-hidden='true'
  >
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2}
      d='M6 18L18 6M6 6l12 12'
    />
  </svg>
);

export const WithStartIcon: Story = {
  args: {
    children: 'Active',
    variant: 'success',
    startIcon: <DotIcon />,
  },
};

export const WithEndIcon: Story = {
  args: {
    children: 'Verified',
    variant: 'success',
    endIcon: <CheckIcon />,
  },
};

export const WithBothIcons: Story = {
  args: {
    children: 'Removable',
    variant: 'secondary',
    startIcon: <DotIcon />,
    endIcon: <XIcon />,
  },
};

// Dark Mode Preview
export const DarkMode: Story = {
  args: {
    children: 'Dark Mode',
    variant: 'primary',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const DarkModeSuccess: Story = {
  args: {
    children: 'Active',
    variant: 'success',
    startIcon: <DotIcon />,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// All Variants Grid
export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-col gap-6 p-8'>
      <div>
        <h3 className='text-sm font-semibold mb-3'>Variants</h3>
        <div className='flex gap-2 flex-wrap'>
          <Badge variant='primary'>Primary</Badge>
          <Badge variant='secondary'>Secondary</Badge>
          <Badge variant='outline'>Outline</Badge>
          <Badge variant='success'>Success</Badge>
          <Badge variant='warning'>Warning</Badge>
          <Badge variant='error'>Error</Badge>
          <Badge variant='info'>Info</Badge>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>Sizes</h3>
        <div className='flex gap-2 items-center flex-wrap'>
          <Badge size='sm'>Small</Badge>
          <Badge size='md'>Medium</Badge>
          <Badge size='lg'>Large</Badge>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>With Icons</h3>
        <div className='flex gap-2 flex-wrap'>
          <Badge variant='success' startIcon={<DotIcon />}>
            Active
          </Badge>
          <Badge variant='success' endIcon={<CheckIcon />}>
            Verified
          </Badge>
          <Badge variant='error' startIcon={<DotIcon />}>
            Offline
          </Badge>
          <Badge
            variant='secondary'
            startIcon={<DotIcon />}
            endIcon={<XIcon />}
          >
            Removable
          </Badge>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3'>Status Indicators</h3>
        <div className='flex gap-2 flex-wrap'>
          <Badge variant='success' startIcon={<DotIcon />}>
            Online
          </Badge>
          <Badge variant='warning' startIcon={<DotIcon />}>
            Away
          </Badge>
          <Badge variant='error' startIcon={<DotIcon />}>
            Busy
          </Badge>
          <Badge variant='secondary' startIcon={<DotIcon />}>
            Offline
          </Badge>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};

// Dark Mode Grid
export const AllVariantsDark: Story = {
  render: () => (
    <div className='flex flex-col gap-6 p-8 dark bg-gray-900 min-h-screen'>
      <div>
        <h3 className='text-sm font-semibold mb-3 text-white'>
          Variants (Dark Mode)
        </h3>
        <div className='flex gap-2 flex-wrap'>
          <Badge variant='primary'>Primary</Badge>
          <Badge variant='secondary'>Secondary</Badge>
          <Badge variant='outline'>Outline</Badge>
          <Badge variant='success'>Success</Badge>
          <Badge variant='warning'>Warning</Badge>
          <Badge variant='error'>Error</Badge>
          <Badge variant='info'>Info</Badge>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-3 text-white'>
          Status Indicators (Dark Mode)
        </h3>
        <div className='flex gap-2 flex-wrap'>
          <Badge variant='success' startIcon={<DotIcon />}>
            Online
          </Badge>
          <Badge variant='warning' startIcon={<DotIcon />}>
            Away
          </Badge>
          <Badge variant='error' startIcon={<DotIcon />}>
            Busy
          </Badge>
          <Badge variant='secondary' startIcon={<DotIcon />}>
            Offline
          </Badge>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
};
