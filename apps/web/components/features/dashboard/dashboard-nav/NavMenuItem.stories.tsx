import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music, SquarePen } from 'lucide-react';
import { expect, fn } from 'storybook/test';
import { NavMenuItem } from './NavMenuItem';

const meta: Meta<typeof NavMenuItem> = {
  title: 'Dashboard/Navigation/Item',
  component: NavMenuItem,
  parameters: {
    layout: 'centered',
    jovie: {
      // The ship-gate required-props heuristic unions every *Props* block in
      // the component file, including the internal
      // NavMenuInteractiveElementProps wiring that NavMenuItem never exposes.
      // None of these are part of the nav-row story contract.
      uncoveredProps: ['onButtonClick', 'onLinkClick', 'onPressStart'],
    },
  },
  decorators: [
    Story => (
      <div className='w-60 bg-sidebar p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    onPrefetch: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof NavMenuItem>;

export const Default: Story = {
  args: {
    item: { id: 'library', name: 'Library', href: '/app/library', icon: Music },
    isActive: false,
  },
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector('a');
    await expect(link).toBeInTheDocument();
    await expect(link).toHaveTextContent('Library');
    await expect(link).toHaveAttribute('href', '/app/library');
  },
};

export const Active: Story = {
  args: {
    item: {
      id: 'library',
      name: 'Library',
      href: '/app/library',
      icon: Music,
    },
    isActive: true,
  },
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector('a');
    await expect(link).toHaveAttribute('aria-current', 'page');
  },
};

// Elevated New Chat create row (JOV-6181): the primary tone drops the
// terminal label fade so the full label renders on the compact w-fit pill.
export const PrimaryCreate: Story = {
  args: {
    item: {
      id: 'chat',
      name: 'New Chat',
      href: '/app/chat',
      icon: SquarePen,
      tone: 'primary',
    },
    isActive: false,
  },
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector('a span');
    await expect(label).toBeInTheDocument();
    await expect(label).toHaveTextContent('New Chat');
    // JOV-6181: compact create tones size with w-fit, so the shared
    // right-edge fade mask would eat ~1rem of short copy. Ensure it stays off.
    await expect(label?.className).not.toContain('mask-image:linear-gradient');
  },
};

export const PreventNavigationButton: Story = {
  args: {
    item: {
      id: 'library',
      name: 'Library',
      href: '/app/library',
      icon: Music,
    },
    isActive: false,
    preventNavigation: true,
    renderAsButton: true,
    onActivate: fn(),
    onNavigate: fn(),
    onClick: fn(),
  },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector('button');
    await expect(trigger).toBeInTheDocument();
    await expect(trigger).toHaveAttribute('aria-pressed', 'false');
    trigger?.click();
  },
};
