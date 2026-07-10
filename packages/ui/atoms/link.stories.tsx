import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Link } from './link';

const meta: Meta<typeof Link> = {
  title: 'shadcn/Link',
  component: Link,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Canonical inline link primitive with default/hover/focus-visible/active/visited/disabled states. Compose Next.js routing via asChild.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'subtle', 'inline'],
    },
    visited: {
      control: { type: 'boolean' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: '#features',
    children: 'View release analytics',
  },
};

export const Subtle: Story = {
  args: {
    href: '#docs',
    variant: 'subtle',
    children: 'Read the docs',
  },
};

export const Inline: Story = {
  args: {
    href: '#terms',
    variant: 'inline',
    children: 'Terms of service',
  },
};

export const Visited: Story = {
  args: {
    href: '#visited-example',
    visited: true,
    children: 'Previously opened link',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Documents visited link styling via data-state="visited" and :visited token --color-link-visited.',
      },
    },
  },
};

export const Active: Story = {
  args: {
    href: '#active-example',
    children: 'Press and hold to preview active opacity',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Active uses tokenized opacity press feedback (active:opacity-80) without layout motion.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    href: '#disabled-example',
    disabled: true,
    children: 'Unavailable link',
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='flex flex-col gap-3'>
      <Link href='#default'>Default</Link>
      <Link href='#hover' className='hover:underline'>
        Hover (use pointer)
      </Link>
      <Link href='#visited' visited>
        Visited
      </Link>
      <Link href='#disabled' disabled>
        Disabled
      </Link>
      <Link href='#inline' variant='inline'>
        Inline
      </Link>
      <Link href='#subtle' variant='subtle'>
        Subtle
      </Link>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Worked example for the component state-matrix (JOV-3574).',
      },
    },
  },
};
