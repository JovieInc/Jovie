import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClaimBanner } from './ClaimBanner';

const meta: Meta<typeof ClaimBanner> = {
  title: 'Profile/ClaimBanner',
  component: ClaimBanner,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ClaimBanner>;

export const Default: Story = {
  args: {
    claimToken: 'abc123',
    profileHandle: 'johndoe',
  },
};

export const WithDisplayName: Story = {
  args: {
    claimToken: 'abc123',
    profileHandle: 'johndoe',
    displayName: 'John Doe',
  },
};

export const LongName: Story = {
  args: {
    claimToken: 'xyz789',
    profileHandle: 'theofficialartistname',
    displayName: 'The Official Artist Name',
  },
};

export const InProfileContext: Story = {
  render: () => (
    <div className='min-h-screen bg-white dark:bg-black'>
      <ClaimBanner
        claimToken='demo-token'
        profileHandle='artistname'
        displayName='Artist Name'
      />
      <div className='p-8 text-center'>
        <p className='text-secondary'>Profile content would appear here...</p>
      </div>
    </div>
  ),
};
