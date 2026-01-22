import type { IconName } from '@/components/atoms/Icon';

export type Feature = {
  slug: string;
  title: string;
  blurb: string;
  href: string;
  icon: IconName;
  colorVar: string;
  aiPowered?: boolean;
};

type FeatureInput = {
  slug: string;
  title: string;
  blurb: string;
  anchor: string;
  icon: IconName;
  accent: string;
  aiPowered?: boolean;
};

const feature = ({
  slug,
  title,
  blurb,
  anchor,
  icon,
  accent,
  aiPowered,
}: FeatureInput): Feature => ({
  slug,
  title,
  blurb,
  href: `/link-in-bio#${anchor}`,
  icon,
  colorVar: `--accent-${accent}`,
  aiPowered,
});

export const FEATURES: Feature[] = [
  feature({
    slug: 'smart-conversions',
    title: 'Smart Conversions',
    blurb: 'AI-optimized CTAs and layouts that adapt in real time.',
    anchor: 'smart-conversions',
    icon: 'TrendingUp',
    accent: 'conv',
    aiPowered: true,
  }),
  feature({
    slug: 'real-time-analytics',
    title: 'Real-Time Analytics',
    blurb: 'Instant insights, always aligned with your ad platforms.',
    anchor: 'analytics',
    icon: 'ChartBar',
    accent: 'analytics',
  }),
  feature({
    slug: 'blazing-fast',
    title: 'Blazing Fast',
    blurb: 'Sub-100ms loads. 99.99% uptime. Fans never wait.',
    anchor: 'performance',
    icon: 'Bolt',
    accent: 'speed',
  }),
  feature({
    slug: 'pixel-perfect-by-default',
    title: 'Pixel-Perfect by Default',
    blurb: "Profiles auto-polished—you can't make them ugly.",
    anchor: 'design',
    icon: 'Sparkles',
    accent: 'beauty',
  }),
  feature({
    slug: 'seo-boost',
    title: 'SEO Boost',
    blurb: 'Structured, discoverable, and lightning-fast by design.',
    anchor: 'seo',
    icon: 'Search',
    accent: 'seo',
  }),
  feature({
    slug: 'deep-links',
    title: 'Deep Links',
    blurb: 'Send fans straight to /listen, /tip, or /subscribe.',
    anchor: 'deep-links',
    icon: 'Link',
    accent: 'links',
  }),
  feature({
    slug: 'pixels-remarketing',
    title: 'Pixels & Remarketing',
    blurb: 'Growth integrations that scale with you.',
    anchor: 'pro',
    icon: 'Rocket',
    accent: 'pro',
  }),
];
