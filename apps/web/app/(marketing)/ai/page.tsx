import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_URL } from '@/constants/app';

export const metadata: Metadata = {
  title: 'Jovie Founder AI Workflow',
  description:
    'The 7-method AI operating system used to run Jovie as a solo founder with team-level output.',
  alternates: {
    canonical: `${APP_URL}/ai`,
  },
};

export default function AiPage() {
  redirect('/ai/index.html');
}
