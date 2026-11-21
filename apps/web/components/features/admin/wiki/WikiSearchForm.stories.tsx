import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WikiSearchForm } from './WikiSearchForm';

const meta = {
  title: 'Features/Admin/WikiSearchForm',
  component: WikiSearchForm,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof WikiSearchForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithQuery: Story = {
  args: {
    initialQuery: 'deployment runbook',
  },
};

export const LongContentQuery: Story = {
  args: {
    initialQuery:
      'how to roll back a deployment when the migration has already run and the cache is warm across every region',
  },
};

export const RtlQuery: Story = {
  args: {
    initialQuery: 'دليل النشر والتراجع',
  },
};
