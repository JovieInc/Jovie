import type { MetadataRoute } from 'next';
import { buildRobotsConfig } from '@/lib/help-center-seo.mjs';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return buildRobotsConfig();
}
