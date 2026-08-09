import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentSectionHeader } from './ContentSectionHeader';

const meta = {
  title: 'Molecules/ContentSectionHeader',
  component: ContentSectionHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [Story => <div className='w-[36rem]'>{Story()}</div>],
} satisfies Meta<typeof ContentSectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SectionHeading: Story = {
  args: {
    title: 'Catalog section',
    subtitle: 'The default section-level heading remains an h2.',
  },
};

export const RouteHeading: Story = {
  args: {
    headingLevel: 'h1',
    title: 'All artists',
    subtitle: 'Use the registered primitive as the route-level heading.',
  },
};
