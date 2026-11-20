import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import {
  ToolbarFilterSuggestions,
  type ToolbarFilterSuggestionsProps,
} from './ToolbarFilterSuggestions';

function FilterGroup(args: ToolbarFilterSuggestionsProps) {
  return (
    <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
      <span className='text-xs text-tertiary-token'>Filter button</span>
      <ToolbarFilterSuggestions {...args} data-testid='suggestions-story' />
    </div>
  );
}

/**
 * State coverage for the quick-apply filter suggestions. Each story renders
 * inside the toolbar-filters group that reveals the row on hover or focus.
 */
const meta = {
  title: 'Organisms/Table/ToolbarFilterSuggestions States',
  component: ToolbarFilterSuggestions,
  parameters: {
    layout: 'padded',
  },
  args: {
    suggestions: [
      { id: 'status-draft', label: 'Status · Draft', onSelect: fn() },
    ],
  },
  render: function FilterGroupStory(args) {
    return <FilterGroup {...args} />;
  },
} satisfies Meta<typeof ToolbarFilterSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one suggestion with no separate accessible label. */
export const PartialSingleSuggestion: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('button', { name: 'Status · Draft' })
    ).toHaveLength(1);
  },
};

/** Long content: many long suggestions clip inside the reserved row. */
export const LongContentManySuggestions: Story = {
  args: {
    suggestions: [
      { id: 'a', label: 'Type · Releases and singles', onSelect: fn() },
      { id: 'b', label: 'Status · Waiting on distributor', onSelect: fn() },
      { id: 'c', label: 'Approval · Needs label review', onSelect: fn() },
      { id: 'd', label: 'Provider · Every streaming service', onSelect: fn() },
    ],
  },
  decorators: [
    function NarrowToolbar(Story) {
      return (
        <div className='w-96'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: Arabic suggestions inside an RTL document. */
export const RtlSuggestions: Story = {
  args: {
    suggestions: [
      {
        id: 'draft',
        label: 'الحالة · مسودة',
        ariaLabel: 'تصفية حسب المسودة',
        onSelect: fn(),
      },
    ],
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
