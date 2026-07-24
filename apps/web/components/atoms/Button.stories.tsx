import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * @deprecated Prefer packages/ui Button stories (`UI/Atoms/Button`).
 * This app-level file only re-imports `@jovie/ui` and duplicates the package
 * library entry. Kept as a thin pointer during one-system consolidation so
 * existing sidebar bookmarks resolve; delete in batch 2 once Chromatic baselines
 * point at packages/ui only.
 */
const meta: Meta<typeof Button> = {
  title: 'UI/Atoms/Button (app mirror — prefer package)',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'MIRROR ONLY. Canonical stories live in packages/ui (title UI/Atoms/Button). Import Button from `@jovie/ui` in product code — never fork a local atom.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'tertiary', 'ghost', 'link'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'icon'],
    },
    destructive: {
      control: { type: 'boolean' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Minimal smoke story so the mirror file still renders; full matrix is in packages/ui. */
export const PreferPackageStories: Story = {
  args: {
    children: 'Use packages/ui Button stories',
    variant: 'primary',
  },
};
