import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Atoms/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Beta',
  },
};

export const PermissionRestricted: Story = {
  args: {
    variant: 'permission-restricted',
    children: 'Admin only',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Permission-restricted state using data-state="permission-restricted" and warning tokens.',
      },
    },
  },
};

export const Variants: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-2'>
      {(
        [
          ['default', 'Default'],
          ['secondary', 'Secondary'],
          ['outline', 'Outline'],
          ['success', 'Success'],
          ['warning', 'Warning'],
          ['destructive', 'Destructive'],
        ] as const
      ).map(([variant, label]) => (
        <Badge key={variant} variant={variant}>
          {label}
        </Badge>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
        <Badge key={size} size={size}>
          {size}
        </Badge>
      ))}
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div className='flex flex-wrap items-center gap-2'>
      {(
        ['neutral', 'info', 'success', 'accent', 'warning', 'error'] as const
      ).map(tone => (
        <Badge key={tone} tone={tone}>
          {tone}
        </Badge>
      ))}
    </div>
  ),
};

export const ConstrainedDestructiveLabel: Story = {
  render: () => (
    <div className='w-28'>
      <Badge variant='destructive'>Account Deletion Requires Approval</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Long destructive labels wrap inside the available width without clipping or overlapping adjacent content.',
      },
    },
  },
};

export const ErrorState: Story = {
  args: {
    variant: 'error',
    children: 'Sync failed',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Error tone for a failed status, using the semantic error tokens.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='w-40'>
      <Badge>Featured on the editorial playlist this week</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long label in a narrow container wraps inside the badge instead of overflowing it.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='flex w-40 flex-wrap items-center gap-2'>
      <Badge>جديد</Badge>
      <Badge variant='success'>تم النشر على جميع المنصات</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left labels keep their reading order and wrap within the container.',
      },
    },
  },
};
