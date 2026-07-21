import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Field } from './field';
import { Input } from './input';

const meta: Meta<typeof Field> = {
  title: 'UI/Atoms/Field',
  component: Field,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Field label='Display name' description='Shown on your public profile' id='field-name'>
      <Input placeholder='Artist name' />
    </Field>
  ),
};

export const Error: Story = {
  render: () => (
    <Field label='Email' error='Enter a valid email address' required id='field-email'>
      <Input type='email' defaultValue='not-an-email' />
    </Field>
  ),
};

export const LongContent: Story = {
  render: () => (
    <div className='w-64'>
      <Field
        label='Bio with a particularly long label that wraps'
        description='Help text that also wraps in a narrow container for overflow checks.'
        id='field-bio'
      >
        <Input />
      </Field>
    </div>
  ),
};
