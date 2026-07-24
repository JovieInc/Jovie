import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { headerTextClass } from './HeaderText';

const HeaderTextExample = ({
  tone = 'primary',
  children = 'Header label',
  className = '',
}: {
  tone?: 'primary' | 'secondary';
  children?: string;
  className?: string;
}) => {
  return <p className={headerTextClass({ tone, className })}>{children}</p>;
};

const meta: Meta<typeof HeaderTextExample> = {
  title: 'Atoms/HeaderText',
  component: HeaderTextExample,
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: { type: 'radio' },
      options: ['primary', 'secondary'],
    },
    children: { control: { type: 'text' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tone: 'primary',
    children: 'Artist dashboard',
  },
};

export const SecondaryTone: Story = {
  args: {
    tone: 'secondary',
    children: 'Fading label',
  },
};
