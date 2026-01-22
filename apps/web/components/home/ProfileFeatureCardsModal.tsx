import {
  ProfileFeatureCardsModalClient,
  type ProfileFeatureCardsModalClientProps,
} from '@/components/home/ProfileFeatureCardsModalClient';

const FEATURES = [
  {
    id: 'fast',
    title: 'Fast, minimal profiles',
    imageSrc: '/images/feature_speed_linear_grey_notext_1344x1280.webp',
    imageAlt: 'Fast profiles preview',
    headline: 'Instant on. No friction.',
    body: 'Your Jovie profile loads fast and stays focused—so fans go from tap to listen, follow, or buy without dropping off.',
  },
  {
    id: 'design',
    title: 'Opinionated design',
    imageSrc: '/images/feature_design_linear_grey_notext_1344x1280.webp',
    imageAlt: 'Opinionated design preview',
    headline: 'Designed to convert.',
    body: 'A clean, premium layout that makes the next step obvious—built to turn attention into real fan actions.',
  },
  {
    id: 'setup',
    title: 'Zero setup',
    imageSrc: '/images/feature_zero_linear_grey_notext_1344x1280.webp',
    imageAlt: 'Zero setup preview',
    headline: "Claim your @handle. You're live.",
    body: "Set up your Jovie profile in seconds—no code, no templates, just a page that's ready to sell.",
  },
] as const satisfies ProfileFeatureCardsModalClientProps['features'];

export function ProfileFeatureCardsModal() {
  return <ProfileFeatureCardsModalClient features={FEATURES} />;
}
