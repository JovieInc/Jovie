import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
import { InputGroup } from './input-group';

const meta: Meta<typeof InputGroup> = {
  title: 'UI/Atoms/InputGroup',
  component: InputGroup,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <InputGroup className='w-72'>
      <span data-slot='icon' aria-hidden='true'>
        @
      </span>
      <Input aria-label='Profile handle' placeholder='artist' />
    </InputGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <InputGroup className='w-72'>
      <span data-slot='icon' aria-hidden='true'>
        $
      </span>
      <Input aria-label='Balance' disabled defaultValue='0.00' />
    </InputGroup>
  ),
};

export const LeadingAndTrailing: Story = {
  render: () => (
    <InputGroup className='w-72' size='lg'>
      <span data-slot='icon' aria-hidden='true'>
        ?
      </span>
      <Input
        aria-label='Search creators'
        placeholder='Search creators'
        size='lg'
      />
      <span data-slot='icon' aria-hidden='true'>
        /
      </span>
    </InputGroup>
  ),
};

export const LongContent: Story = {
  render: () => (
    <InputGroup className='w-56'>
      <span data-slot='icon' aria-hidden='true'>
        @
      </span>
      <Input
        aria-label='Profile link'
        defaultValue='https://jov.ie/an-extremely-long-artist-handle-that-keeps-going'
      />
      <span data-slot='icon' aria-hidden='true'>
        ↗
      </span>
    </InputGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long value in a narrow group clips inside the padded input without running under the leading or trailing icon.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='w-56'>
      <InputGroup>
        <span data-slot='icon' aria-hidden='true'>
          ?
        </span>
        <Input
          aria-label='ابحث عن الفنانين'
          placeholder='ابحث عن الفنانين والإصدارات وقوائم التشغيل المفضلة لديك'
        />
      </InputGroup>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic placeholder in a narrow right-to-left container: the text starts at the right edge and clips before the icon slot.',
      },
    },
  },
};
