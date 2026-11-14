import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { CompositeField } from './composite-field';

const meta: Meta<typeof CompositeField> = {
  title: 'UI/Atoms/CompositeField',
  component: CompositeField,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const ClaimPill: Story = {
  render: () => (
    <CompositeField className='w-96' shape='pill' surface='page'>
      <span className='shrink-0 text-secondary-token'>jov.ie/</span>
      <input
        aria-label='Choose your handle'
        className='min-w-0 flex-1 bg-transparent text-primary-token'
        placeholder='you'
      />
      <Button size='sm' type='button'>
        Claim
      </Button>
    </CompositeField>
  ),
};

export const RoundedRect: Story = {
  render: () => (
    <CompositeField className='w-80' shape='md' size='sm' surface='shell'>
      <input
        aria-label='Search'
        className='min-w-0 flex-1 bg-transparent text-primary-token'
        placeholder='Search'
        type='search'
      />
    </CompositeField>
  ),
};

export const Empty: Story = {
  render: () => (
    <CompositeField className='w-96' shape='pill' surface='field'>
      <span className='shrink-0 text-secondary-token'>jov.ie/</span>
      <input
        aria-label='Choose your handle'
        className='min-w-0 flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token'
        placeholder='your-artist-name'
      />
      <Button size='sm' type='button' disabled>
        Claim
      </Button>
    </CompositeField>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'No handle typed yet: the placeholder shows after the prefix and the action waits disabled.',
      },
    },
  },
};

export const ErrorState: Story = {
  render: () => (
    <div className='grid w-96 gap-2'>
      <CompositeField shape='pill' surface='field'>
        <span className='shrink-0 text-secondary-token'>jov.ie/</span>
        <input
          aria-label='Choose your handle'
          aria-invalid='true'
          aria-describedby='composite-field-error-message'
          className='min-w-0 flex-1 bg-transparent text-error-text'
          defaultValue='taken'
        />
        <Button size='sm' type='button'>
          Claim
        </Button>
      </CompositeField>
      <p
        id='composite-field-error-message'
        className='px-1 text-xs text-error-text'
        role='alert'
      >
        That handle is already taken. Try another.
      </p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Invalid handle: the inner input carries aria-invalid and points at the error message, matching the claim-handle form.',
      },
    },
  },
};

export const PartialPrefixOnly: Story = {
  render: () => (
    <CompositeField className='w-80' shape='md' size='sm' surface='field'>
      <span className='shrink-0 text-secondary-token'>jov.ie/</span>
      <input
        aria-label='Profile handle'
        className='min-w-0 flex-1 bg-transparent text-primary-token'
        defaultValue='tim'
      />
    </CompositeField>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only a prefix and the input, with no action or status part: the field still owns one rounded focus ring.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <CompositeField className='w-72' shape='pill' surface='field'>
      <span className='shrink-0 text-secondary-token'>jov.ie/</span>
      <input
        aria-label='Choose your handle'
        className='min-w-0 flex-1 truncate bg-transparent text-primary-token'
        defaultValue='an-extremely-long-artist-handle-that-keeps-going-past-the-edge'
      />
      <Button size='sm' type='button' className='shrink-0'>
        Claim
      </Button>
    </CompositeField>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long handle in a narrow field clips inside the input; the prefix and the action keep their size.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='w-72'>
      <CompositeField shape='pill' surface='field'>
        <input
          aria-label='ابحث في المكتبة'
          className='min-w-0 flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token'
          placeholder='ابحث عن الأغاني والفنانين والإصدارات وقوائم التشغيل'
          type='search'
        />
        <Button size='sm' type='button' className='shrink-0'>
          بحث
        </Button>
      </CompositeField>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic placeholder and action in a narrow right-to-left field: the parts mirror order and the placeholder clips before the button.',
      },
    },
  },
};
