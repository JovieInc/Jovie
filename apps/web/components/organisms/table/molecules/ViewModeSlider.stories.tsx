import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Grid3x3, LayoutList, Table2 } from 'lucide-react';
import { useState } from 'react';
import { ViewModeSlider, type ViewModeSliderOption } from './ViewModeSlider';

type LibraryViewMode = 'grid' | 'list' | 'table';

const VIEW_OPTIONS: readonly ViewModeSliderOption<LibraryViewMode>[] = [
  { value: 'grid', label: 'Grid View', icon: Grid3x3 },
  { value: 'list', label: 'List View', icon: LayoutList },
  { value: 'table', label: 'Table View', icon: Table2 },
];

const meta = {
  title: 'Organisms/Table/ViewModeSlider',
  component: ViewModeSlider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ViewModeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

function LibraryViewDemo() {
  const [view, setView] = useState<LibraryViewMode>('grid');

  return (
    <div className='grid gap-3'>
      <ViewModeSlider
        aria-label='Library View'
        value={view}
        onChange={setView}
        options={VIEW_OPTIONS}
      />
      <p className='text-xs text-tertiary-token'>
        Active view: <span className='text-primary-token'>{view}</span>
      </p>
    </div>
  );
}

export const Default: Story = {
  args: {
    'aria-label': 'Library View',
    value: 'grid',
    onChange: () => undefined,
    options: VIEW_OPTIONS,
  },
  render: () => <LibraryViewDemo />,
};

export const ListActive: Story = {
  name: 'List active',
  args: {
    ...Default.args,
    value: 'list',
  },
  render: args => (
    <ViewModeSlider
      aria-label={args['aria-label']}
      value='list'
      onChange={() => undefined}
      options={VIEW_OPTIONS}
    />
  ),
};
