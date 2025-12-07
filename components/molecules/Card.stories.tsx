import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Card, CardContent, CardHeader, CardTitle } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Molecules/Card',
  component: Card,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: (
      <p className='text-secondary'>This is a basic card with some content.</p>
    ),
  },
};

export const WithHeader: Story = {
  render: () => (
    <Card className='w-80'>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-secondary'>
          This card has a header with a title and content section.
        </p>
      </CardContent>
    </Card>
  ),
};

export const ProfileCard: Story = {
  render: () => (
    <Card className='w-80'>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          <p className='text-sm text-secondary'>Display Name</p>
          <p className='font-medium'>John Doe</p>
        </div>
        <div className='space-y-2'>
          <p className='text-sm text-secondary'>Handle</p>
          <p className='font-medium'>@johndoe</p>
        </div>
      </CardContent>
    </Card>
  ),
};

export const StatsCard: Story = {
  render: () => (
    <Card className='w-64'>
      <CardHeader>
        <CardTitle>Total Views</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-3xl font-bold'>12,345</p>
        <p className='text-sm text-green-600'>+12% from last month</p>
      </CardContent>
    </Card>
  ),
};

export const CardGrid: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-4 w-[600px]'>
      <Card>
        <CardHeader>
          <CardTitle>Views</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-2xl font-bold'>1,234</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clicks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-2xl font-bold'>567</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Followers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-2xl font-bold'>890</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-2xl font-bold'>$123</p>
        </CardContent>
      </Card>
    </div>
  ),
};
