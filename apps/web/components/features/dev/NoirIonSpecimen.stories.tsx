import type { Meta, StoryObj } from '@storybook/react';
import { type ReactNode, useEffect } from 'react';
import { NoirIonSpecimen } from './NoirIonSpecimen';

/**
 * Noir Ion anchors are declared under `:root.dark`. Storybook must put
 * `dark` on <html> so product tokens resolve (not a nested .dark wrapper).
 */
function DarkRootDecorator({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!hadDark) root.classList.remove('dark');
    };
  }, []);
  return children;
}

const meta = {
  title: 'Design System/Noir Ion Specimen',
  component: NoirIonSpecimen,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <DarkRootDecorator>
        <Story />
      </DarkRootDecorator>
    ),
  ],
} satisfies Meta<typeof NoirIonSpecimen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full elevation, accent, table/selection, and primary-action reference. */
export const Default: Story = {};
