import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { TocEntry } from '@/types/docs';
import { PublicTableOfContents } from './PublicTableOfContents';

const toc: TocEntry[] = [
  { id: 'overview', title: 'Overview', level: 2 },
  { id: 'scope', title: 'Scope', level: 3 },
  { id: 'your-rights', title: 'Your rights', level: 2 },
  { id: 'contact', title: 'Contact us', level: 2 },
];

const meta = {
  title: 'Molecules/PublicTableOfContents',
  component: PublicTableOfContents,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-56 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    toc,
  },
} satisfies Meta<typeof PublicTableOfContents>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomAriaLabel: Story = {
  args: {
    ariaLabel: 'Legal document navigation',
  },
};

export const Empty: Story = {
  args: {
    toc: [],
  },
};
