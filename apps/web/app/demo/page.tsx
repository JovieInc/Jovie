import type { Metadata } from 'next';
import { DemoReleasesExperience } from '@/components/demo/DemoReleasesExperience';

export const metadata: Metadata = {
  title: 'Jovie Demo',
  description:
    'See Jovie in action with a live product demo. Explore releases, audience insights, and analytics — no sign-up required.',
};

export const revalidate = false;

export default function DemoPage() {
  return <DemoReleasesExperience />;
}
