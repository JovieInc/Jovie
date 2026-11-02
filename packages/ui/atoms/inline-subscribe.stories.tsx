import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { InlineSubscribe } from './inline-subscribe';

const meta: Meta<typeof InlineSubscribe> = {
  title: 'UI/Atoms/InlineSubscribe',
  component: InlineSubscribe,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <form className='w-96' onSubmit={event => event.preventDefault()}>
        <InlineSubscribe
          ariaLabel='Email address'
          buttonLabel='Subscribe'
          value={value}
          onValueChange={setValue}
        />
      </form>
    );
  },
};
