import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { SegmentControl } from './segment-control';

const meta: Meta<typeof SegmentControl> = {
  title: 'shadcn/SegmentControl',
  component: SegmentControl,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'SegmentControl for switching between mutually exclusive options. Built on Radix UI Tabs with full keyboard navigation, three variants, and three sizes.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'ghost', 'linear-pill'],
      description: 'Visual style variant',
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Size for both container and triggers',
    },
    layout: {
      control: { type: 'select' },
      options: ['fill', 'hug'],
      description: 'Stretch tabs to fill the control or hug label width',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const viewOptions = [
  { value: 'links', label: 'Links' },
  { value: 'music', label: 'Music' },
  { value: 'videos', label: 'Videos' },
];

// Core Variants
export const Default: Story = {
  render: function DefaultStory(args) {
    const [value, setValue] = React.useState('links');
    return (
      <div className='w-80'>
        <SegmentControl
          {...args}
          value={value}
          onValueChange={setValue}
          options={viewOptions}
          aria-label='Select link category'
        />
      </div>
    );
  },
};

export const Ghost: Story = {
  render: function GhostStory(args) {
    const [value, setValue] = React.useState('links');
    return (
      <div className='w-80'>
        <SegmentControl
          {...args}
          variant='ghost'
          value={value}
          onValueChange={setValue}
          options={viewOptions}
          aria-label='Select link category'
        />
      </div>
    );
  },
};

export const LinearPill: Story = {
  render: function LinearPillStory(args) {
    const [value, setValue] = React.useState('music');
    return (
      <div className='w-80'>
        <SegmentControl
          {...args}
          variant='linear-pill'
          value={value}
          onValueChange={setValue}
          options={viewOptions}
          aria-label='Select link category'
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Linear pill variant with an animated active indicator that tracks the selected tab.',
      },
    },
  },
};

// Sizes
export const Sizes: Story = {
  render: () => (
    <div className='flex w-96 flex-col gap-4'>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size}>
          <h3 className='text-sm font-semibold mb-2'>{size}</h3>
          <SegmentControl
            size={size}
            value='links'
            onValueChange={() => {}}
            options={viewOptions}
            aria-label={`Select link category (${size})`}
          />
        </div>
      ))}
    </div>
  ),
};

// States
export const DisabledOption: Story = {
  render: function DisabledOptionStory(args) {
    const [value, setValue] = React.useState('links');
    return (
      <div className='w-80'>
        <SegmentControl
          {...args}
          value={value}
          onValueChange={setValue}
          options={[
            { value: 'links', label: 'Links' },
            { value: 'music', label: 'Music', disabled: true },
            { value: 'videos', label: 'Videos' },
          ]}
          aria-label='Select link category'
        />
      </div>
    );
  },
};

export const HugLayout: Story = {
  render: function HugLayoutStory(args) {
    const [value, setValue] = React.useState('links');
    return (
      <SegmentControl
        {...args}
        layout='hug'
        value={value}
        onValueChange={setValue}
        options={viewOptions}
        aria-label='Select link category'
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Hug layout shrinks each tab to its label width.',
      },
    },
  },
};

// Content Stress
export const LongLabels: Story = {
  render: function LongLabelsStory(args) {
    const [value, setValue] = React.useState('social');
    return (
      <div className='w-96'>
        <SegmentControl
          {...args}
          value={value}
          onValueChange={setValue}
          options={[
            { value: 'social', label: 'Social media links' },
            { value: 'streaming', label: 'Streaming services' },
          ]}
          aria-label='Select link category'
        />
      </div>
    );
  },
};

export const NarrowContainer: Story = {
  render: function NarrowContainerStory(args) {
    const [value, setValue] = React.useState('links');
    return (
      <div className='w-44'>
        <SegmentControl
          {...args}
          value={value}
          onValueChange={setValue}
          options={viewOptions}
          aria-label='Select link category'
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Control inside a 176px container to verify overflow behavior.',
      },
    },
  },
};

// Dark Mode Preview
export const DarkMode: Story = {
  render: function DarkModeStory(args) {
    const [value, setValue] = React.useState('music');
    return (
      <div className='w-80'>
        <SegmentControl
          {...args}
          value={value}
          onValueChange={setValue}
          options={viewOptions}
          aria-label='Select link category'
        />
      </div>
    );
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
