import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NativeSelect } from './native-select';

const options = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
  { value: 'archived', label: 'Archived', disabled: true },
];

const meta: Meta<typeof NativeSelect> = {
  title: 'UI/Atoms/NativeSelect',
  component: NativeSelect,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { options, label: 'Release status', name: 'status' },
};

export const Required: Story = {
  args: { options, label: 'Release status', required: true, name: 'status' },
};

export const Selected: Story = {
  args: {
    options,
    label: 'Release status',
    defaultValue: 'live',
    name: 'status',
  },
};

export const Error: Story = {
  args: {
    options,
    label: 'Release status',
    error: 'Choose a status',
    name: 'status',
  },
};

export const Disabled: Story = {
  args: { options, label: 'Release status', disabled: true, name: 'status' },
};

export const Empty: Story = {
  args: {
    options,
    label: 'Release status',
    placeholder: 'Pick a status',
    defaultValue: '',
    name: 'status',
  },
  parameters: {
    docs: {
      description: {
        story:
          'No value chosen: the empty placeholder option shows until a status is picked.',
      },
    },
  },
};

export const PartialBareSelect: Story = {
  args: {
    options,
    'aria-label': 'Release status',
    defaultValue: 'draft',
    name: 'status',
  },
  parameters: {
    docs: {
      description: {
        story:
          'No label or error supplied: the bare select renders without the field wrapper and takes its name from aria-label.',
      },
    },
  },
};

export const LongContent: Story = {
  args: {
    options: [
      {
        value: 'scheduled',
        label:
          'Scheduled for worldwide release on every connected streaming platform',
      },
      { value: 'live', label: 'Live' },
    ],
    label:
      'Release status shown to collaborators, distributors, and your label team',
    defaultValue: 'scheduled',
    error:
      'This release is missing artwork, so it cannot be scheduled until artwork is uploaded.',
    name: 'status',
  },
  decorators: [
    Story => (
      <div className='w-56'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'A long label, option, and error in a narrow column: the label and error wrap while the select keeps its height and clips the option text.',
      },
    },
  },
};

export const PermissionDenied: Story = {
  render: () => (
    <div className='grid gap-1'>
      <NativeSelect
        options={options}
        label='Release status'
        defaultValue='live'
        disabled
        aria-describedby='native-select-permission-reason'
        name='status'
      />
      <p
        id='native-select-permission-reason'
        className='text-xs text-tertiary-token'
      >
        Only your label admin can change the release status.
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Disabled for a collaborator without rights; the current value stays visible and the reason is linked with aria-describedby.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <NativeSelect
        options={[
          { value: 'draft', label: 'مسودة' },
          {
            value: 'scheduled',
            label: 'مجدول للإصدار على جميع منصات البث المتصلة حول العالم',
          },
        ]}
        label='حالة الإصدار كما تظهر للمتعاونين والموزعين وفريق التسمية'
        placeholder='اختر حالة الإصدار'
        defaultValue='scheduled'
        error='ينقص هذا الإصدار صورة الغلاف، لذا لا يمكن جدولته حتى يتم رفعها.'
        name='status'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic label, options, and error in a right-to-left column: text reads from the start edge and long lines wrap or clip without widening the field.',
      },
    },
  },
};
