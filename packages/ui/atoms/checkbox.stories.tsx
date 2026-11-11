import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Checkbox } from './checkbox';
import { Label } from './label';

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Atoms/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Checkbox id='cb-default' />
      <Label htmlFor='cb-default'>Subscribe</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Checkbox id='cb-checked' defaultChecked />
      <Label htmlFor='cb-checked'>Subscribed</Label>
    </div>
  ),
};

export const Indeterminate: Story = {
  render: () => (
    <div className='flex items-center gap-2'>
      <Checkbox id='cb-indeterminate' checked='indeterminate' />
      <Label htmlFor='cb-indeterminate'>Some tracks selected</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className='grid gap-3'>
      <div className='flex items-center gap-2'>
        <Checkbox id='cb-dis' disabled />
        <Label htmlFor='cb-dis'>Disabled</Label>
      </div>
      <div className='flex items-center gap-2'>
        <Checkbox id='cb-dis-checked' disabled defaultChecked />
        <Label htmlFor='cb-dis-checked'>Disabled and checked</Label>
      </div>
    </div>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <div className='grid gap-4'>
      {[
        { id: 'cb-matrix-off', label: 'Unchecked' },
        { id: 'cb-matrix-on', label: 'Checked', checked: true },
        {
          id: 'cb-matrix-mixed',
          label: 'Indeterminate',
          checked: 'indeterminate' as const,
        },
      ].map(item => (
        <div className='flex items-center gap-2' key={item.id}>
          <Checkbox id={item.id} checked={item.checked} />
          <Label htmlFor={item.id}>{item.label}</Label>
        </div>
      ))}
    </div>
  ),
};

export const EmptySelection: Story = {
  render: () => (
    <fieldset className='grid gap-3'>
      <legend className='mb-1 text-app text-secondary-token'>
        No tracks selected
      </legend>
      {[
        { id: 'cb-empty-intro', label: 'Intro' },
        { id: 'cb-empty-night', label: 'Night drive' },
        { id: 'cb-empty-outro', label: 'Outro' },
      ].map(item => (
        <div className='flex items-center gap-2' key={item.id}>
          <Checkbox id={item.id} />
          <Label htmlFor={item.id}>{item.label}</Label>
        </div>
      ))}
    </fieldset>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'An empty selection: every checkbox in the list is unchecked and the legend says nothing is selected yet.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='flex w-56 items-start gap-2'>
      <Checkbox id='cb-long' className='mt-0.5' />
      <Label htmlFor='cb-long' className='leading-snug'>
        Send me an email whenever a new release, presave, or tour date is
        published to my profile
      </Label>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long label in a narrow column wraps beside the checkbox, which keeps its 16px size and stays aligned to the first line.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='flex w-56 items-start gap-2'>
      <Checkbox id='cb-rtl' className='mt-0.5' defaultChecked />
      <Label htmlFor='cb-rtl' className='leading-snug'>
        أرسل لي بريدًا إلكترونيًا عند نشر إصدار جديد أو موعد حفل في ملفي الشخصي
      </Label>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'An Arabic label in a narrow right-to-left column: the checkbox sits at the start edge and the label wraps beside it.',
      },
    },
  },
};
