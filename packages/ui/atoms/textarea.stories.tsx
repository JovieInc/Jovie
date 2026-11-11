import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Atoms/Textarea',
  component: Textarea,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Release notes',
    placeholder: 'Tell fans about your release…',
    helpText: 'Keep it concise and specific.',
    id: 'ta-default',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'Read only',
    id: 'ta-disabled',
    label: 'Read-only notes',
  },
};

export const Error: Story = {
  args: {
    label: 'Release notes',
    validationState: 'invalid',
    defaultValue: 'Too short',
    helpText: 'Describe what listeners should know.',
    error: 'Use at least 20 characters.',
    id: 'ta-error',
  },
};

export const Success: Story = {
  args: {
    label: 'Release notes',
    validationState: 'valid',
    defaultValue: 'A stripped-back version recorded live in Los Angeles.',
    helpText: 'Ready to publish.',
    id: 'ta-success',
  },
};

export const Pending: Story = {
  args: {
    label: 'Release notes',
    validationState: 'pending',
    defaultValue: 'A stripped-back version recorded live in Los Angeles.',
    helpText: 'Checking copy…',
    id: 'ta-pending',
  },
};

export const Sizes: Story = {
  render: () => (
    <div className='grid w-80 gap-4'>
      <Textarea id='ta-small' textareaSize='sm' label='Small' />
      <Textarea id='ta-medium' label='Medium' />
      <Textarea id='ta-large' textareaSize='lg' label='Large' />
    </div>
  ),
};

export const LongContent: Story = {
  args: {
    id: 'ta-long',
    label: 'Bio',
    defaultValue: Array.from(
      { length: 8 },
      (_, i) => `Line ${i + 1} of bio content.`
    ).join('\n'),
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};

export const PartialDraft: Story = {
  args: {
    id: 'ta-partial',
    label: 'Release notes',
    defaultValue: 'Recorded live in Los Angeles with',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Only the label slot is supplied (no help text or error) and the draft is half written.',
      },
    },
  },
};

export const PermissionDenied: Story = {
  args: {
    id: 'ta-permission-denied',
    label: 'Label copy',
    readOnly: true,
    defaultValue: 'Distributed by Jovie Records. All rights reserved.',
    helpText: 'Only your label admin can edit label copy.',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Read-only for a collaborator without edit rights: the text stays selectable and the help text names who can change it.',
      },
    },
  },
};

export const Rtl: Story = {
  args: {
    id: 'ta-rtl',
    label: 'نبذة عن الفنان كما ستظهر في صفحتك العامة',
    placeholder: 'اكتب للمعجبين عن إصدارك القادم وما الذي يجعله مميزًا',
    defaultValue:
      'سُجّل هذا الألبوم مباشرة في لوس أنجلوس مع فرقة كاملة من الموسيقيين المستقلين، ويضم أحد عشر مقطعًا جديدًا تُنشر لأول مرة على جميع المنصات.',
    helpText: 'اجعل النص موجزًا ومحددًا ليقرأه المعجبون بسرعة.',
  },
  decorators: [
    Story => (
      <div dir='rtl' className='w-64'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'Arabic label, value, and help text in a narrow right-to-left container: lines wrap from the start edge inside the field.',
      },
    },
  },
};
