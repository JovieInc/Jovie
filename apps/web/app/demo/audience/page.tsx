import type { Metadata } from 'next';
import DemoAudienceSection from '@/features/demo/DemoAudienceSection';
import { DemoAuthShell } from '@/features/demo/DemoAuthShell';

export const metadata: Metadata = {
  title: 'Jovie Demo – Audience',
  description:
    'See Jovie audience CRM in action. Explore fan intelligence, source tracking, and segments — no sign-up required.',
};

export const dynamic = 'force-dynamic';

export default function DemoAudiencePage() {
  return (
    <DemoAuthShell>
      <DemoAudienceSection />
    </DemoAuthShell>
  );
}
