import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HelpCenterDestination } from '@/components/HelpCenterDestination';
import {
  getHelpCenterDestination,
  HELP_CENTER_DESTINATIONS,
} from '@/lib/help-center-home.mjs';

export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_CENTER_DESTINATIONS.map(destination => ({
    slug: destination.slug.split('/'),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const destination = getHelpCenterDestination(slug.join('/'));
  if (!destination) return {};
  return {
    title: destination.title,
    description: destination.description,
  };
}

export default async function HelpCenterDestinationPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const destination = getHelpCenterDestination(slug.join('/'));
  if (!destination) notFound();
  return <HelpCenterDestination destination={destination} />;
}
