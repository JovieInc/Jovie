import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DeferredSection } from './DeferredSection';

const meta = {
  title: 'Organisms/DeferredSection',
  component: DeferredSection,
  parameters: {
    layout: 'padded',
  },
  args: {
    placeholderHeight: 320,
    children: (
      <div className='rounded-lg border border-subtle bg-surface-1 p-8 text-primary-token'>
        Deferred content
      </div>
    ),
  },
} satisfies Meta<typeof DeferredSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CompactPlaceholder: Story = {
  args: {
    placeholderHeight: 160,
    placeholderWidth: '75%',
  },
};
