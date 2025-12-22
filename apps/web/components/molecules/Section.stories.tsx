import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Section } from './Section';

const meta: Meta<typeof Section> = {
  title: 'Molecules/Section',
  component: Section,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    containerSize: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg', 'xl'],
    },
    withGridBg: {
      control: 'boolean',
    },
    withBorder: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Section>;

const SampleContent = () => (
  <div className='text-center'>
    <h2 className='text-3xl font-bold mb-4'>Section Title</h2>
    <p className='text-secondary max-w-2xl mx-auto'>
      This is a section component that provides consistent padding, container
      sizing, and optional background patterns for page layouts.
    </p>
  </div>
);

export const Default: Story = {
  args: {
    padding: 'lg',
    containerSize: 'lg',
    children: <SampleContent />,
  },
};

export const WithGridBackground: Story = {
  args: {
    padding: 'lg',
    containerSize: 'lg',
    withGridBg: true,
    children: <SampleContent />,
  },
};

export const WithBorder: Story = {
  args: {
    padding: 'lg',
    containerSize: 'lg',
    withBorder: true,
    children: <SampleContent />,
  },
};

export const SmallPadding: Story = {
  args: {
    padding: 'sm',
    containerSize: 'md',
    children: <SampleContent />,
  },
};

export const ExtraLargePadding: Story = {
  args: {
    padding: 'xl',
    containerSize: 'xl',
    children: <SampleContent />,
  },
};

export const StackedSections: Story = {
  render: () => (
    <div>
      <Section padding='lg' containerSize='lg'>
        <div className='text-center'>
          <h2 className='text-3xl font-bold mb-4'>First Section</h2>
          <p className='text-secondary'>Content for the first section.</p>
        </div>
      </Section>
      <Section padding='lg' containerSize='lg' withBorder withGridBg>
        <div className='text-center'>
          <h2 className='text-3xl font-bold mb-4'>Second Section</h2>
          <p className='text-secondary'>
            Content with grid background and border.
          </p>
        </div>
      </Section>
      <Section padding='lg' containerSize='lg' withBorder>
        <div className='text-center'>
          <h2 className='text-3xl font-bold mb-4'>Third Section</h2>
          <p className='text-secondary'>Content for the third section.</p>
        </div>
      </Section>
    </div>
  ),
};
