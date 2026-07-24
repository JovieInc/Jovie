import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SectionHeading } from './SectionHeading';

const meta: Meta<typeof SectionHeading> = {
  title: 'Atoms/SectionHeading',
  component: SectionHeading,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    level: {
      control: { type: 'select' },
      options: [1, 2, 3, 4, 5, 6],
    },
    align: {
      control: { type: 'select' },
      options: ['left', 'center', 'right'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Featured Creators',
    level: 2,
    align: 'center',
    size: 'lg',
  },
};

export const H1: Story = {
  args: {
    children: 'Main Page Title',
    level: 1,
    align: 'center',
    size: 'xl',
  },
};

export const H3: Story = {
  args: {
    children: 'Subsection Heading',
    level: 3,
    align: 'left',
    size: 'md',
  },
};

export const SmallSize: Story = {
  args: {
    children: 'Small Heading',
    level: 2,
    align: 'center',
    size: 'sm',
  },
};

export const ExtraLarge: Story = {
  args: {
    children: 'Hero Title',
    level: 1,
    align: 'center',
    size: 'xl',
  },
};

export const LeftAligned: Story = {
  args: {
    children: 'Left Aligned Heading',
    level: 2,
    align: 'left',
    size: 'lg',
  },
};

export const RightAligned: Story = {
  args: {
    children: 'Right Aligned Heading',
    level: 2,
    align: 'right',
    size: 'lg',
  },
};

export const WithId: Story = {
  args: {
    children: 'Heading with ID for Accessibility',
    level: 2,
    align: 'center',
    size: 'lg',
    id: 'section-heading',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex flex-col gap-6 text-center'>
      <SectionHeading level={2} size='sm'>
        Small Heading
      </SectionHeading>
      <SectionHeading level={2} size='md'>
        Medium Heading
      </SectionHeading>
      <SectionHeading level={2} size='lg'>
        Large Heading
      </SectionHeading>
      <SectionHeading level={2} size='xl'>
        Extra Large Heading
      </SectionHeading>
    </div>
  ),
};

export const AllAlignments: Story = {
  render: () => (
    <div className='flex flex-col gap-6 w-96'>
      <SectionHeading level={2} align='left' size='md'>
        Left Aligned
      </SectionHeading>
      <SectionHeading level={2} align='center' size='md'>
        Center Aligned
      </SectionHeading>
      <SectionHeading level={2} align='right' size='md'>
        Right Aligned
      </SectionHeading>
    </div>
  ),
};
