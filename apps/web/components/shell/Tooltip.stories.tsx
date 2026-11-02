import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { Tooltip } from './Tooltip';

const meta = {
  title: 'Shell/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  args: {
    children: (
      <Button type='button' variant='secondary'>
        Audience
      </Button>
    ),
    label: 'Open audience',
    defaultOpen: true,
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <RenderedFamily name='Tooltip' owner='Tooltip' interactive>
        <div className='p-4'>
          <Story />
        </div>
      </RenderedFamily>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Label: Story = {};

export const Shortcut: Story = {
  args: {
    shortcut: { keys: 'G A', description: 'Open audience' },
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Ask Jovie about audience engagement over the last quarter',
  },
};

export const InputSwitching: Story = { args: { defaultOpen: false } };
export const Ineligible: Story = { args: { disabled: true } };
export const ListPlacement: Story = {
  args: { side: 'bottom', align: 'start' },
};
