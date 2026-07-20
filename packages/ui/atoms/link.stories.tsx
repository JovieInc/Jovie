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
          'Canonical inline link primitive with default, subtle, and inline variants. States: default, hover, focus-visible, active (:active + data-state="active"), visited (:visited + data-state="visited"), and disabled (aria-disabled + state tokens). Composes onto Next.js Link via asChild (Radix Slot).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'subtle', 'inline'],
    },
    active: {
      control: { type: 'boolean' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
    visited: {
      control: { type: 'boolean' },
    },
    asChild: {
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
  parameters: {
    docs: {
      description: {
        story:
          'Default state also covers native :hover and :focus-visible interaction states.',
      },
    },
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

export const Active: Story = {
  args: {
    href: '#active-example',
    active: true,
    children: 'Current page link',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Active/pressed link styling via data-state="active" and the interactive accent token --color-accent; native :active applies the same token while pressing.',
      },
    },
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

export const Disabled: Story = {
  args: {
    href: '#disabled-example',
    disabled: true,
    children: 'Unavailable link',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Disabled links set aria-disabled, data-state="disabled", pointer-events-none, and the disabled-visual tokens (--state-disabled-opacity, --color-text-disabled-token). Anchors do not support the disabled attribute.',
      },
    },
  },
};

export const AsChild: Story = {
  render: args => (
    <Link {...args} asChild>
      <button type='button'>Composed child element</button>
    </Link>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'asChild composes the primitive onto a single child via Radix Slot. In apps, this is how the canonical Link keeps Next.js <Link> client-side navigation: <Link asChild><NextLink href="/x">…</NextLink></Link>.',
      },
    },
  },
};
