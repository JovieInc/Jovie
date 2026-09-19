import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingEmailSignupSection } from './MarketingEmailSignup';

const meta = {
  title: 'Marketing/Sections/Product Updates',
  component: MarketingEmailSignupSection,
  args: { source: 'marketing:/blog' },
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/blog' } },
    docs: {
      description: {
        component:
          'Approved qKrDn product-update capture. Real form and endpoint contract; preview requests require an explicitly configured test response.',
      },
    },
  },
} satisfies Meta<typeof MarketingEmailSignupSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
