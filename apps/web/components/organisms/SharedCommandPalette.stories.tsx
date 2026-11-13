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

// Release rows arrive before the provider has attached artwork or metadata.
const partialSections: readonly PaletteSection[] = [
  {
    id: 'releases',
    label: 'Releases',
    items: [
      {
        kind: 'entity',
        entity: { kind: 'release', id: 'release-untitled', label: 'Untitled' },
      },
      {
        kind: 'entity',
        entity: {
          kind: 'release',
          id: 'release-midnight',
          label: 'Midnight City',
          meta: { kind: 'release', subtitle: 'Single' },
        },
      },
    ],
  },
];

const LONG_LABEL =
  'Midnight City (Extended Club Mix) [Remastered Deluxe Anniversary Edition]';

const longSections: readonly PaletteSection[] = [
  {
    id: 'releases',
    label: 'Releases From Every Profile You Manage',
    items: Array.from({ length: 12 }, (_, index) => ({
      kind: 'entity' as const,
      entity: {
        kind: 'release' as const,
        id: `release-long-${index + 1}`,
        label: `${LONG_LABEL} ${index + 1}`,
        meta: {
          kind: 'release' as const,
          subtitle:
            'Featuring an Unusually Long List of Collaborating Artists and Producers',
        },
      },
    })),
  },
];

const rtlSections: readonly PaletteSection[] = [
  {
    id: 'go-to',
    label: 'انتقال إلى',
    items: [
      {
        kind: 'nav',
        nav: {
          kind: 'nav',
          id: 'library-rtl',
          label: 'المكتبة',
          description: 'إدارة الإصدارات والصور والبضائع الخاصة بك في مكان واحد',
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

export const PartialEntityRows: Story = {
  args: { sections: partialSections },
};

export const LongContentSections: Story = {
  args: { sections: longSections },
  decorators: [
    Story => (
      <div className='w-full max-w-sm'>
        <Story />
      </div>
    ),
  ],
};

export const RtlSuggestions: Story = {
  args: { sections: rtlSections, emptyHint: 'لا توجد نتائج' },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-full max-w-sm'>
        <Story />
      </div>
    ),
  ],
};
