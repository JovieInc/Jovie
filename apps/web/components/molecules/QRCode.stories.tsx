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

/** Only the required data: the 120px size and the default label apply. */
export const PartialDataOnly: Story = {
  args: {
    data: 'https://jov.ie/tim',
  },
};

/**
 * The admin HUD passes an empty string while its kiosk link is unresolved:
 * there is nothing to encode, so the same unavailable fallback the failure
 * path uses renders instead of a code that scans to nothing.
 */
export const EmptyData: Story = {
  args: {
    data: '',
    label: 'HUD Link',
  },
};

/**
 * Generation failed (the `qrcode` module could not render): the frame keeps
 * its size and shows the unavailable fallback. The export name is the error
 * state (`Failed*`). A static story cannot reject the encoder, so this frame
 * matches EmptyData, and QRCode.test.tsx holds the rejection and the decode
 * error.
 */
export const FailedGeneration: Story = {
  args: {
    data: 'https://jov.ie/tim',
    size: 120,
    label: 'Scan To Open This Profile On Your Phone',
  },
};

export const LongContentUrl: Story = {
  args: {
    data: 'https://jov.ie/tim/never-say-a-word-extended-club-mix?utm_source=qr&utm_medium=print&utm_campaign=summer-tour-poster-los-angeles&utm_content=back-cover',
    size: 160,
    label:
      'Scan to open Never Say A Word (Extended Club Mix) on your phone from the summer tour poster',
  },
};

export const RtlCaption: Story = {
  render: () => (
    <div dir='rtl' className='space-y-2 text-center'>
      <QRCode
        data='https://jov.ie/tim'
        size={120}
        label='امسح لفتح هذا الملف الشخصي على هاتفك'
        className='mx-auto'
      />
      <p className='text-xs text-secondary-token'>
        امسح لفتح هذا الملف الشخصي على هاتفك
      </p>
    </div>
  ),
};
