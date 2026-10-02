import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { type PageRecord, pageRecordPath } from './pageRecord';

/**
 * Next metadata for a page record, read only from `record.seo`. `noindex`
 * records keep follow so internal links still pass discovery.
 */
export function buildPageRecordMetadata(record: PageRecord): Metadata {
  const { seo } = record;
  const url = `${BASE_URL}${pageRecordPath(record)}`;
  const socialTitle = seo.socialTitle ?? seo.title;
  const ogImage = `${BASE_URL}${seo.ogImage}`;

  return {
    title: seo.title,
    description: seo.description,
    keywords: [...seo.keywords],
    alternates: { canonical: url },
    ...(record.status === 'noindex'
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: {
      title: socialTitle,
      description: seo.description,
      url,
      siteName: APP_NAME,
      type: 'website',
      images: [
        {
          url: ogImage,
          secureUrl: ogImage,
          width: 1200,
          height: 630,
          alt: seo.title,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: seo.description,
      images: [ogImage],
      creator: '@meetjovie',
      site: '@meetjovie',
    },
  };
}
