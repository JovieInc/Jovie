import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { SegmentControl } from './segment-control';

const meta: Meta<typeof SegmentControl> = {
  title: 'UI/Atoms/SegmentControl',
  component: SegmentControl,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A compact, accessible control for mutually exclusive views. Every size keeps a 44px interaction target, long labels truncate safely, and the linear-pill indicator follows the shared System B geometry.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

interface DemoProps {
  readonly disabledOption?: boolean;
  readonly variant?: 'default' | 'ghost' | 'linear-pill';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly layout?: 'fill' | 'hug';
  readonly longLabels?: boolean;
}

function Demo({
  disabledOption = false,
  variant = 'default',
  size = 'md',
  layout = 'fill',
  longLabels = false,
}: DemoProps) {
  const [value, setValue] = useState<'details' | 'activity' | 'sources'>(
    'details'
  );

  return (
    <SegmentControl
      value={value}
      onValueChange={setValue}
      aria-label='Profile view'
      variant={variant}
      size={size}
      layout={layout}
      options={[
        {
          value: 'details',
          label: longLabels ? 'Audience details and attributes' : 'Details',
        },
        { value: 'activity', label: 'Activity', disabled: disabledOption },
        {
          value: 'sources',
          label: longLabels ? 'Acquisition sources and referrals' : 'Sources',
        },
      ]}
    />
  );
}

export const Default: Story = {
  render: () => (
    <div className='w-80'>
      <Demo />
    </div>
  ),
};

export const WithDisabled: Story = {
  render: () => (
    <div className='w-80'>
      <Demo disabledOption />
    </div>
  ),
};

export const VariantMatrix: Story = {
  render: () => (
    <div className='grid w-96 gap-6 rounded-2xl bg-surface-page p-6'>
      <Demo variant='default' />
      <Demo variant='ghost' />
      <Demo variant='linear-pill' layout='hug' />
    </div>
  ),
};

export const SizeMatrix: Story = {
  render: () => (
    <div className='grid w-96 gap-6 rounded-2xl bg-surface-page p-6'>
      <Demo size='sm' />
      <Demo size='md' />
      <Demo size='lg' />
    </div>
  ),
};

export const NarrowLongLabels: Story = {
  render: () => (
    <div className='w-64 rounded-2xl border border-subtle bg-surface-1 p-3'>
      <Demo longLabels />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Long labels remain within the control at narrow widths while their complete accessible names stay in the DOM.',
      },
    },
  },
};

function IconOnlyDemo() {
  const [value, setValue] = useState<'grid' | 'list'>('grid');
  return (
    <SegmentControl
      value={value}
      onValueChange={setValue}
      aria-label='Result layout'
      layout='hug'
      variant='linear-pill'
      options={[
        {
          value: 'grid',
          label: <span aria-hidden='true'>▦</span>,
          ariaLabel: 'Grid view',
        },
        {
          value: 'list',
          label: <span aria-hidden='true'>☷</span>,
          ariaLabel: 'List view',
        },
      ]}
    />
  );
}

export const IconOnly: Story = { render: () => <IconOnlyDemo /> };

export const DarkMode: Story = {
  render: () => (
    <div className='w-80'>
      <Demo />
    </div>
  ),
  parameters: { backgrounds: { default: 'dark' } },
};
