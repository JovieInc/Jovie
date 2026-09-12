import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InspectorEmpty } from './InspectorEmpty';
import { InspectorRow } from './InspectorRow';
import { InspectorSection } from './InspectorSection';

const meta = {
  title: 'Molecules/Inspector/InspectorSection',
  component: InspectorSection,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Assets',
    disabled: false,
    children: (
      <>
        <InspectorRow label='ISRC' value='USRC17607839' />
        <InspectorEmpty message='No assets for this object.' />
      </>
    ),
  },
} satisfies Meta<typeof InspectorSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Untitled: Story = {
  args: {
    title: undefined,
  },
};
