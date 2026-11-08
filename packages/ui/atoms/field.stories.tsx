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
    <Field
      label='Display name'
      description='Shown on your public profile'
      id='field-name'
    >
      <Input placeholder='Artist name' />
    </Field>
  ),
};

export const Error: Story = {
  render: () => (
    <Field
      label='Email'
      error='Enter a valid email address'
      required
      id='field-email'
    >
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

export const PreservesControlDescription: Story = {
  render: () => (
    <div className='w-72'>
      <p
        id='external-profile-help'
        className='mb-2 text-xs text-tertiary-token'
      >
        This note belongs to the surrounding workflow.
      </p>
      <Field
        label='Profile handle'
        description='You can change this later.'
        id='field-handle'
      >
        <Input aria-describedby='external-profile-help' defaultValue='jovie' />
      </Field>
    </div>
  ),
};

export const PartialLabelOnly: Story = {
  render: () => (
    <div className='w-72'>
      <Field label='Display name' id='field-partial'>
        <Input defaultValue='Tim' />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only a label is supplied: no description or error, and the feedback slot still holds its space.',
      },
    },
  },
};

export const PermissionDenied: Story = {
  render: () => (
    <div className='w-72'>
      <Field
        label='Payout email'
        description='Only the account owner can change where payouts are sent.'
        id='field-permission-denied'
      >
        <Input type='email' defaultValue='owner@jov.ie' disabled />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The wrapped control is disabled for a viewer without rights; the description, wired via aria-describedby, says why.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='w-64'>
      <Field
        label='اسم العرض كما يظهر في ملفك الشخصي العام للمعجبين'
        description='يظهر هذا الاسم في أعلى صفحة الروابط الخاصة بك وفي جميع الإصدارات القادمة.'
        error='الاسم طويل جدًا، استخدم أقل من أربعين حرفًا.'
        required
        id='field-rtl'
      >
        <Input defaultValue='فرقة الليل الطويل وأصدقاؤها من الموسيقيين المستقلين' />
      </Field>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic label, description, and error in a narrow right-to-left container: each line wraps from the start edge and the value clips inside the input.',
      },
    },
  },
};
