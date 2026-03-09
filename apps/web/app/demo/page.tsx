import type { Metadata } from 'next';
import { DemoReleasesExperience } from '@/components/demo/DemoReleasesExperience';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie Demo',
  description:
    'See Jovie in action with a live product demo. Explore releases, audience insights, analytics, and more.',
};

export default function DemoPage() {
  return <DemoReleasesExperience />;
}
