import '../../public-marketing.css';
import '../../(marketing)/marketing-utilities.css';

import type { Metadata } from 'next';
import {
  MARKETING_SECTION_FAMILIES,
  MARKETING_SECTION_PAGES,
  MARKETING_SECTION_REGISTRY,
  MARKETING_SECTION_STATUSES,
} from '@/data/marketingSectionRegistry';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { MarketingSectionsLabClient } from '../marketing-sections/MarketingSectionsLabClient';

export const metadata: Metadata = {
  title: 'Design Studio',
  robots: NOINDEX_ROBOTS,
};

export const revalidate = false;

export default function DesignStudioPage() {
  return (
    <MarketingSectionsLabClient
      sections={MARKETING_SECTION_REGISTRY}
      pages={MARKETING_SECTION_PAGES}
      families={MARKETING_SECTION_FAMILIES}
      statuses={MARKETING_SECTION_STATUSES}
    />
  );
}
