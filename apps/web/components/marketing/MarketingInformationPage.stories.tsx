import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { requireMarketingInformationPage } from '@/data/marketingInformationArchitecture';
import { MarketingInformationPage } from './MarketingInformationPage';

const meta = {
  title: 'Marketing/Pages/MarketingInformationPage',
  component: MarketingInformationPage,
  parameters: { layout: 'fullscreen' },
  args: { page: requireMarketingInformationPage(APP_ROUTES.PRODUCT) },
} satisfies Meta<typeof MarketingInformationPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductOverview: Story = {};
