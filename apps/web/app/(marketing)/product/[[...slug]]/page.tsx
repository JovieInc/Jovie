import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketingInformationPage } from '@/components/marketing/MarketingInformationPage';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import {
  getMarketingInformationPage,
  MARKETING_INFORMATION_PAGES,
} from '@/data/marketingInformationArchitecture';

export const revalidate = false;

type ProductPageProps = Readonly<{
  params: Promise<{ slug?: string[] }>;
}>;

function resolvePath(slug?: readonly string[]) {
  return slug?.length
    ? `${APP_ROUTES.PRODUCT}/${slug.join('/')}`
    : APP_ROUTES.PRODUCT;
}

export function generateStaticParams() {
  return MARKETING_INFORMATION_PAGES.filter(page =>
    page.path.startsWith(`${APP_ROUTES.PRODUCT}/`)
  ).map(page => ({
    slug: page.path.slice(APP_ROUTES.PRODUCT.length + 1).split('/'),
  }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const page = getMarketingInformationPage(resolvePath((await params).slug));
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `${BASE_URL}${page.path}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `${BASE_URL}${page.path}`,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const page = getMarketingInformationPage(resolvePath((await params).slug));
  if (!page) notFound();
  return <MarketingInformationPage page={page} />;
}
