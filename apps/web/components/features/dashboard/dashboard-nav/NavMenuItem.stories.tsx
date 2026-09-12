import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { House, SquarePen } from 'lucide-react';
import { expect, fn } from 'storybook/test';
import { NavMenuItem } from './NavMenuItem';

const meta: Meta<typeof NavMenuItem> = {
  title: 'Dashboard/Navigation/NavMenuItem',
  component: NavMenuItem,
  parameters: {
    layout: 'centered',
    // onButtonClick/onLinkClick/onPressStart are internal wiring props the
    // component derives itself (NavMenuInteractiveElement) — not authorable
    // from outside, so they are allowlisted rather than forced into args.
    jovie: {
      uncoveredProps: ['onButtonClick', 'onLinkClick', 'onPressStart'],
    },
  },
  args: {
    onPrefetch: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof NavMenuItem>;

export const Default: Story = {
  args: {
    item: {
      id: 'home',
      name: 'Home',
      href: '/app/home',
      icon: House,
    },
    isActive: false,
  },
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector('a');
    await expect(link).toBeInTheDocument();
    await expect(link).toHaveTextContent('Home');
    await expect(link).toHaveAttribute('href', '/app/home');
  },
};

export const Active: Story = {
  args: {
    item: {
      id: 'home',
      name: 'Home',
      href: '/app/home',
      icon: House,
    },
    isActive: true,
  },
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector('a');
    await expect(link).toHaveAttribute('aria-current', 'page');
  },
};

export const PrimaryNewChat: Story = {
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
      id: 'home',
      name: 'Home',
      href: '/app/home',
      icon: House,
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
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    trigger?.click();
  },
};
