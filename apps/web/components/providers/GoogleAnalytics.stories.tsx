import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GoogleAnalytics } from './GoogleAnalytics';

const meta = {
  title: 'Providers/GoogleAnalytics',
  component: GoogleAnalytics,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/artist/tip/thank-you' },
    },
    docs: {
      description: {
        component:
          'Renderless analytics provider. Checkout returns suppress loading and configuration to keep session URLs out of analytics.',
      },
    },
  },
} satisfies Meta<typeof GoogleAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CheckoutReturnExcluded: Story = {};
