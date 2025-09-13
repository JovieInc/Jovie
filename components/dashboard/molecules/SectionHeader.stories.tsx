import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SectionHeader } from './SectionHeader';

const meta: Meta<typeof SectionHeader> = {
  title: 'Dashboard/Molecules/SectionHeader',
  component: SectionHeader,
  parameters: { layout: 'padded' },
  args: {
    title: 'Subsection Title',
    description: 'Optional description for context.',
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof SectionHeader>;

export const Default: Story = {};

export const WithActions: Story = {
  args: {
    right: (
      <div className='flex gap-2'>
        <Button variant='outline' size='sm'>
          Secondary
        </Button>
        <Button variant='primary' size='sm'>
          Primary
        </Button>
      </div>
    ),
  },
};

export const WithoutDescription: Story = {
  args: {
    description: undefined,
  },
};
