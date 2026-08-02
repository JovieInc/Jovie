import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InlinePalette, type PaletteSection } from './SharedCommandPalette';

const sections: readonly PaletteSection[] = [
  {
    id: 'go-to',
    label: 'Go To',
    items: [
      {
        kind: 'nav',
        nav: {
          kind: 'nav',
          id: 'library',
          label: 'Library',
          description: 'Manage releases, images, and merch.',
          iconName: 'Music',
          surfaces: ['cmdk'],
          href: '/app/library',
        },
      },
    ],
  },
];

const meta = {
  title: 'Organisms/SharedCommandPalette',
  component: InlinePalette,
  parameters: {
    layout: 'centered',
    jovie: {
      // CmdKPaletteRow is an internal render helper. Its props are covered by
      // the Cmd+K interaction test rather than a public Storybook API.
      uncoveredProps: [
        'commitIndex',
        'item',
        'index',
        'isActive',
        'onMouseEnter',
      ],
    },
  },
  args: {
    sections,
    selectedIndex: 0,
    setSelectedIndex: () => undefined,
    onCommit: () => undefined,
    variant: 'inline',
  },
} satisfies Meta<typeof InlinePalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SlashSuggestions: Story = {};

export const Empty: Story = {
  args: {
    sections: [],
    emptyHint: 'No matching commands',
  },
};
