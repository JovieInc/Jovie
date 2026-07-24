import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistName } from './ArtistName';

const meta: Meta<typeof ArtistName> = {
  title: 'Atoms/ArtistName',
  component: ArtistName,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    isVerified: {
      control: { type: 'boolean' },
    },
    showLink: {
      control: { type: 'boolean' },
    },
    as: {
      control: { type: 'select' },
      options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'Taylor Swift',
    handle: 'taylorswift',
    isVerified: false,
  },
};

export const Verified: Story = {
  args: {
    name: 'Taylor Swift',
    handle: 'taylorswift',
    isVerified: true,
  },
};

export const Small: Story = {
  args: {
    name: 'Ed Sheeran',
    handle: 'edsheeran',
    size: 'sm',
    isVerified: true,
  },
};

export const Medium: Story = {
  args: {
    name: 'Billie Eilish',
    handle: 'billieeilish',
    size: 'md',
    isVerified: true,
  },
};

export const Large: Story = {
  args: {
    name: 'The Weeknd',
    handle: 'theweeknd',
    size: 'lg',
    isVerified: true,
  },
};

export const ExtraLarge: Story = {
  args: {
    name: 'Drake',
    handle: 'drake',
    size: 'xl',
    isVerified: true,
  },
};

export const WithoutLink: Story = {
  args: {
    name: 'Ariana Grande',
    handle: 'arianagrande',
    isVerified: true,
    showLink: false,
  },
};

export const Inline: Story = {
  args: {
    name: 'Lorde',
    handle: 'lorde',
    isVerified: true,
    as: 'span',
    showLink: false,
  },
  render: args => (
    <p>
      Listen to <ArtistName {...args} /> now.
    </p>
  ),
};

export const LongName: Story = {
  args: {
    name: 'Florence + The Machine',
    handle: 'florenceandthemachine',
    isVerified: true,
  },
};

export const InDarkMode: Story = {
  args: {
    name: 'Post Malone',
    handle: 'postmalone',
    isVerified: true,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
