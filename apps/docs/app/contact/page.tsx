import type { Metadata } from 'next';
import { ContactSupport } from '@/components/ContactSupport';

export const metadata: Metadata = {
  title: 'Contact Support',
  description:
    'Contact the Jovie support team with the page and search context that failed you already attached.',
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  };

  return <ContactSupport from={pick('from')} query={pick('q')} />;
}
