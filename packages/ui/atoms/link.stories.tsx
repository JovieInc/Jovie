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
          'Canonical inline link primitive with default, subtle, and inline variants. Visited styling uses :visited and optional data-state="visited".',
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
