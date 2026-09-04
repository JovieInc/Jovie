import { MarketingInformationPage } from '@/components/marketing/MarketingInformationPage';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { requireMarketingInformationPage } from '@/data/marketingInformationArchitecture';

export const revalidate = false;
const page = requireMarketingInformationPage(APP_ROUTES.TOOLS);
export const metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: `${BASE_URL}${page.path}` },
  openGraph: {
    title: page.title,
    description: page.description,
    url: `${BASE_URL}${page.path}`,
  },
};

export default function ToolsPage() {
  return <MarketingInformationPage page={page} />;
}
