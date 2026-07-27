import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = {
  title: 'shadcn/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Textarea with default/error/success variants, three sizes, optional label, error message, help text, and validation state with full ARIA wiring.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'error', 'success'],
      description: 'Visual style variant',
    },
    textareaSize: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
      description: 'Textarea size',
    },
    resizable: {
      control: { type: 'boolean' },
      description: 'Allow vertical resizing',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
    label: {
      control: { type: 'text' },
      description: 'Label text rendered above the textarea',
    },
    error: {
      control: { type: 'text' },
      description: 'Error message rendered below the textarea',
    },
    helpText: {
      control: { type: 'text' },
      description: 'Help text rendered above the textarea',
    },
    validationState: {
      control: { type: 'select' },
      options: ['valid', 'invalid', 'pending', null],
      description: 'Validation state (overrides variant when set)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Core States
export const Default: Story = {
  args: {
    placeholder: 'Tell us about yourself...',
    className: 'w-80',
  },
};

export const WithLabel: Story = {
  render: args => (
    <div className='w-80'>
      <Textarea {...args} />
    </div>
  ),
  args: {
    label: 'Bio',
    placeholder: 'A short description shown on your profile',
  },
};

export const WithHelpText: Story = {
  render: args => (
    <div className='w-80'>
      <Textarea {...args} />
    </div>
  ),
  args: {
    label: 'Bio',
    helpText: 'Markdown is supported. 160 characters max.',
    placeholder: 'A short description shown on your profile',
  },
};

// Validation States
export const WithError: Story = {
  render: args => (
    <div className='w-80'>
      <Textarea {...args} />
    </div>
  ),
  args: {
    label: 'Bio',
    error: 'Bio must be 160 characters or fewer.',
    defaultValue:
      'This bio is deliberately too long so the error state has real content to display next to it.',
  },
};

export const ErrorVariant: Story = {
  args: {
    variant: 'error',
    placeholder: 'Invalid content...',
    className: 'w-80',
  },
  parameters: {
    docs: {
      description: {
        story: 'Error styling applied directly via the variant prop.',
      },
    },
  },
};

export const SuccessValidation: Story = {
  args: {
    validationState: 'valid',
    defaultValue: 'Looks good.',
    className: 'w-80',
  },
  parameters: {
    docs: {
      description: {
        story: 'validationState="valid" applies the success variant.',
      },
    },
  },
};

// States
export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'You cannot edit this.',
    className: 'w-80',
  },
};

export const NonResizable: Story = {
  args: {
    resizable: false,
    placeholder: 'Fixed height...',
    className: 'w-80',
  },
};

// Sizes
export const Small: Story = {
  args: {
    textareaSize: 'sm',
    placeholder: 'Small textarea',
    className: 'w-80',
  },
};

export const Large: Story = {
  args: {
    textareaSize: 'lg',
    placeholder: 'Large textarea',
    className: 'w-80',
  },
};

// Content Stress
export const LongContent: Story = {
  args: {
    className: 'w-80',
    defaultValue:
      'Line one of a fairly long piece of content.\n\nLine two keeps going with even more text so the textarea has to manage multiple paragraphs and show how the vertical resize handle behaves with real content inside it.\n\nLine three wraps things up.',
  },
};

export const NarrowContainer: Story = {
  render: args => (
    <div className='w-44'>
      <Textarea {...args} />
    </div>
  ),
  args: {
    placeholder: 'Narrow container textarea with wrapping placeholder text',
  },
  parameters: {
    docs: {
      description: {
        story: 'Textarea inside a 176px container to verify text wrapping.',
      },
    },
  },
};

// Dark Mode Preview
export const DarkMode: Story = {
  args: {
    placeholder: 'Tell us about yourself...',
    className: 'w-80',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
