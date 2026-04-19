import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QRCode } from './QRCode';

const meta: Meta<typeof QRCode> = {
  title: 'Molecules/QRCode',
  component: QRCode,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'number', min: 100, max: 400, step: 10 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: 'https://jov.ie/taylorswift',
    label: 'Scan to view profile',
  },
};

export const Small: Story = {
  args: {
    data: 'https://jov.ie/edsheeran',
    size: 100,
    label: 'Small QR Code',
  },
};

export const Large: Story = {
  args: {
    data: 'https://jov.ie/billieeilish',
    size: 200,
    label: 'Large QR Code',
  },
};

export const MobileProfile: Story = {
  args: {
    data: 'https://jov.ie/theweeknd?utm_source=qr&utm_medium=mobile',
    size: 150,
    label: 'Scan to view on mobile',
  },
};

export const PayLink: Story = {
  args: {
    data: 'https://jov.ie/drake?mode=pay',
    size: 120,
    label: 'Scan to pay via Apple Pay',
  },
};

export const WithCustomURL: Story = {
  args: {
    data: 'https://custom-domain.com/artist-profile',
    size: 160,
    label: 'Custom domain QR',
  },
};

export const InContainer: Story = {
  render: () => (
    <div className='text-center space-y-4 p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg'>
      <QRCode
        data='https://jov.ie/arianagrande'
        size={180}
        label='Scan to pay via Apple Pay'
        className='mx-auto'
      />
      <p className='text-sm text-gray-600 dark:text-gray-400'>
        Scan to pay via Apple Pay
      </p>
    </div>
  ),
};
