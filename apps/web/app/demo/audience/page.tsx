import type { Metadata } from 'next';
import { DemoAudienceWorkspace } from '@/features/demo/DemoAudienceWorkspace';

export const metadata: Metadata = {
  title: 'Jovie Demo – Audience',
  description:
    'See Jovie audience CRM in action. Explore fan intelligence, source tracking, and segments — no sign-up required.',
};

export const revalidate = false;

export default function DemoAudiencePage() {
  return <DemoAudienceWorkspace />;
}
