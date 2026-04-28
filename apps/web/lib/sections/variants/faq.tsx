import { FaqSection } from '@/components/marketing/FaqSection';
import type { SectionVariant } from '../registry';

const DEMO_FAQ_ITEMS = [
  {
    question: 'Do I need to switch distributors to use Jovie?',
    answer:
      'No. Jovie reads your catalog from the DSPs themselves and works alongside whatever distributor you already use. Your release pipeline stays where it is.',
  },
  {
    question:
      'What does Jovie actually do that LinkTree or Bandzoogle does not?',
    answer:
      'It knows your catalog. Source-traced answers, catalog-health checks, and release-rollout planning all run against the music you have actually released — not generic advice.',
  },
  {
    question: 'Can I use the chat without setting up a public profile?',
    answer:
      'Yes. Chat works as soon as you connect your Spotify artist ID. Public profile is opt-in.',
  },
  {
    question: 'How is data handled when I ask the chat about my fans?',
    answer:
      'Read-only tools query your authenticated profile only. The chat model never sees other users’ data, and tool inputs cannot accept arbitrary profile or user IDs.',
  },
] as const;

export const FAQ_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'faq-section-default',
    category: 'faq',
    label: 'FAQ — accordion',
    description:
      'Standard collapsible accordion FAQ. Used on artist-profile and support pages.',
    componentPath: 'components/marketing/FaqSection.tsx',
    usedIn: ['/artist-profile', '/support'],
    status: 'canonical',
    canonical: true,
    render: () => <FaqSection items={DEMO_FAQ_ITEMS} />,
  },
];
