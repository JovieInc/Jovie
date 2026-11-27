import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { InspectorTabs } from './InspectorTabs';
import { INSPECTOR_TAB_OPTIONS } from './inspector-tabs';

const meta = {
  title: 'Molecules/Inspector/InspectorTabs/States',
  component: InspectorTabs,
  parameters: { layout: 'centered' },
  decorators: [
    function TabsFrame(Story) {
      return (
        <div className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    value: 'details' as const,
    onValueChange: fn(),
    options: INSPECTOR_TAB_OPTIONS,
    ariaLabel: 'Inspector tabs',
  },
} satisfies Meta<typeof InspectorTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no tabs, only the empty rail. */
export const EmptyNoTabs: Story = { args: { options: [] } };

/** Partial: one tab is disabled until its data is ready. */
export const PartialDisabledTab: Story = {
  args: {
    options: [
      { value: 'details', label: 'Details' },
      { value: 'assets', label: 'Assets', disabled: true },
      { value: 'links', label: 'Links' },
    ],
  },
};

/** Long content: long labels share the rail width. */
export const LongContentLabels: Story = {
  args: {
    options: [
      { value: 'details', label: 'Release details and credits' },
      { value: 'assets', label: 'Artwork, audio and press assets' },
    ],
  },
};

/** Permission denied: restricted tabs stay visible but disabled. */
export const PermissionDeniedRestrictedTabs: Story = {
  args: {
    options: [
      { value: 'details', label: 'Details' },
      { value: 'rights', label: 'Rights', disabled: true },
    ],
  },
};

/** Rtl: the rail and actions mirror in a right-to-left layout. */
export const RtlTabs: Story = {
  args: {
    options: [
      { value: 'details', label: 'التفاصيل' },
      { value: 'assets', label: 'الملفات' },
    ],
    actions: <span>⋯</span>,
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};
