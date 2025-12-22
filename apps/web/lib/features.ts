import type { IconName } from '@/components/atoms/Icon';

export type Feature = {
  slug: string;
  title: string;
  blurb: string;
  href: string;
  icon: IconName;
  colorVar: string; // e.g., '--accent-conv'
  aiPowered?: boolean; // Flag for AI-powered tag
};

export const FEATURES: Feature[] = [
  {
    slug: 'smart-conversions',
    title: 'Smart Conversions',
    blurb: 'AI-optimized CTAs and layouts that adapt in real time.',
    href: '/link-in-bio#smart-conversions',
    icon: 'TrendingUp',
    colorVar: '--accent-conv',
    aiPowered: true,
  },
  {
    slug: 'real-time-analytics',
    title: 'Real-Time Analytics',
    blurb: 'Instant insights, always aligned with your ad platforms.',
    href: '/link-in-bio#analytics',
    icon: 'ChartBar',
    colorVar: '--accent-analytics',
  },
  {
    slug: 'blazing-fast',
    title: 'Blazing Fast',
    blurb: 'Sub-100ms loads. 99.99% uptime. Fans never wait.',
    href: '/link-in-bio#performance',
    icon: 'Bolt',
    colorVar: '--accent-speed',
  },
  {
    slug: 'pixel-perfect-by-default',
    title: 'Pixel-Perfect by Default',
    blurb: "Profiles auto-polished—you can't make them ugly.",
    href: '/link-in-bio#design',
    icon: 'Sparkles',
    colorVar: '--accent-beauty',
  },
  {
    slug: 'seo-boost',
    title: 'SEO Boost',
    blurb: 'Structured, discoverable, and lightning-fast by design.',
    href: '/link-in-bio#seo',
    icon: 'Search',
    colorVar: '--accent-seo',
  },
  {
    slug: 'deep-links',
    title: 'Deep Links',
    blurb: 'Send fans straight to /listen, /tip, or /subscribe.',
    href: '/link-in-bio#deep-links',
    icon: 'Link',
    colorVar: '--accent-links',
  },
  {
    slug: 'pixels-remarketing',
    title: 'Pixels & Remarketing',
    blurb: 'Growth integrations that scale with you.',
    href: '/link-in-bio#pro',
    icon: 'Rocket',
    colorVar: '--accent-pro',
  },
];
