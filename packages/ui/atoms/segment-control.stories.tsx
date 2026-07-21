import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { SegmentControl } from './segment-control';

const meta: Meta<typeof SegmentControl> = {
  title: 'UI/Atoms/SegmentControl',
  component: SegmentControl,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ disabledOption = false }: { readonly disabledOption?: boolean }) {
  const [value, setValue] = useState<'links' | 'music'>('links');
  return (
    <SegmentControl
      value={value}
      onValueChange={setValue}
      aria-label='Category'
      options={[
        { value: 'links', label: 'Links' },
        { value: 'music', label: 'Music', disabled: disabledOption },
      ]}
    />
  );
}

export const Default: Story = { render: () => <Demo /> };
export const WithDisabled: Story = { render: () => <Demo disabledOption /> };
export const DarkMode: Story = {
  render: () => <Demo />,
  parameters: { backgrounds: { default: 'dark' } },
};
