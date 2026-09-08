import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NumberedSection } from './NumberedSection';

const meta = {
  title: 'Marketing/Sections/NumberedSection',
  component: NumberedSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    sectionNumber: '1.0',
    sectionTitle: 'Intake',
    heading: 'Start with the release.',
    description:
      'Capture the artist, asset, and release context before choosing the route.',
    children: (
      <div className='rounded-xl border border-subtle bg-surface-0 p-6 text-primary-token'>
        Release plan preview
      </div>
    ),
    subItems: [
      {
        number: '1.1',
        title: 'Profile',
        description: 'Confirm the public profile surface.',
      },
      {
        number: '1.2',
        title: 'Campaign',
        description: 'Choose the conversion moment.',
      },
    ],
  },
} satisfies Meta<typeof NumberedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    sectionNumber: '1.0',
    sectionTitle: 'Intake',
    heading: 'Start with the release.',
    description:
      'Capture the artist, asset, and release context before choosing the route.',
    children: (
      <div className='rounded-xl border border-subtle bg-surface-0 p-6 text-primary-token'>
        Release plan preview
      </div>
    ),
  },
};
