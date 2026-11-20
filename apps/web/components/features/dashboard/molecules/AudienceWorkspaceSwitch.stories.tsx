import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceWorkspaceSwitch } from './AudienceWorkspaceSwitch';

const meta = {
  title: 'Features/Dashboard/Molecules/AudienceWorkspaceSwitch',
  component: AudienceWorkspaceSwitch,
  parameters: {
    layout: 'padded',
    nextjs: {
      navigation: {
        pathname: '/app/contacts',
        query: { q: 'berlin', page: '2' },
      },
    },
  },
  args: { value: 'contacts' },
} satisfies Meta<typeof AudienceWorkspaceSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Contacts: Story = {};

export const Audience: Story = {
  args: { value: 'audience' },
};

export const Insights: Story = {
  args: { value: 'insights' },
  parameters: {
    nextjs: { navigation: { pathname: '/app/insights' } },
  },
};
