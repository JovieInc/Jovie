import type { Metadata } from 'next';
import { JovieWorkPanel } from '@/components/features/dashboard/organisms/jovie-work-feed/JovieWorkPanel';

export const metadata: Metadata = {
  title: 'Jovie Did This',
  description: 'Autonomous workflows, approvals, and results for your profile.',
};

export default function JovieWorkPage() {
  return <JovieWorkPanel />;
}
