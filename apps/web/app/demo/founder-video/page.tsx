import type { Metadata } from 'next';
import { FounderDemoRecordingSurface } from '@/features/demo/FounderDemoRecordingSurface';

export const metadata: Metadata = {
  title: 'Founder Demo Recording',
  robots: {
    index: false,
    follow: false,
  },
};

export const revalidate = false;

export default function FounderDemoVideoPage() {
  return <FounderDemoRecordingSurface />;
}
