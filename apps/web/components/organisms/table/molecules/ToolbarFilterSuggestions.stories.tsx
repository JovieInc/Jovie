import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ToolbarFilterSuggestions } from './ToolbarFilterSuggestions';

const SAMPLE_SUGGESTIONS = [
  { id: 'type-releases', label: 'Type · Releases', onSelect: fn() },
  { id: 'status-draft', label: 'Status · Draft', onSelect: fn() },
  {
    id: 'approval-needs-review',
    label: 'Approval · Needs Review',
    onSelect: fn(),
  },
];

const meta = {
  title: 'Organisms/Table/ToolbarFilterSuggestions',
  component: ToolbarFilterSuggestions,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    suggestions: SAMPLE_SUGGESTIONS,
  },
} satisfies Meta<typeof ToolbarFilterSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * At rest the row sits at opacity 0 but still reserves its layout space —
 * hover or focus the `group/toolbar-filters` wrapper to reveal it.
 */
export const RevealedOnHover: Story = {
  name: 'Revealed on hover/focus',
  render: args => (
    <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
      <span className='text-xs text-tertiary-token'>Filter button</span>
      <ToolbarFilterSuggestions {...args} data-testid='suggestions-story' />
    </div>
  ),
};

/** Hidden (not unmounted) while the owning filter dropdown is open. */
export const HiddenWhileFilterOpen: Story = {
  name: 'Hidden while filter dropdown is open',
  args: {
    ...meta.args,
    hidden: true,
  },
  render: args => (
    <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
      <span className='text-xs text-tertiary-token'>Filter button (open)</span>
      <ToolbarFilterSuggestions {...args} data-testid='suggestions-story' />
    </div>
  ),
};

function InteractiveDemo() {
  const [applied, setApplied] = useState<string | null>(null);

  return (
    <div className='grid gap-3'>
      <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
        <span className='text-xs text-tertiary-token'>Filter button</span>
        <ToolbarFilterSuggestions
          suggestions={SAMPLE_SUGGESTIONS.map(suggestion => ({
            ...suggestion,
            onSelect: () => setApplied(suggestion.label),
          }))}
        />
      </div>
      <p className='text-xs text-tertiary-token'>
        Applied:{' '}
        <span className='text-primary-token'>{applied ?? 'none yet'}</span>
      </p>
    </div>
  );
}

export const AppliesARealFilter: Story = {
  name: 'Applies a real filter on click',
  render: () => <InteractiveDemo />,
};

export const Empty: Story = {
  args: {
    suggestions: [],
  },
  render: args => (
    <div className='group/toolbar-filters flex items-center gap-2 rounded-full border border-subtle p-2'>
      <span className='text-xs text-tertiary-token'>
        Filter button (no suggestions — renders nothing)
      </span>
      <ToolbarFilterSuggestions {...args} />
    </div>
  ),
};
