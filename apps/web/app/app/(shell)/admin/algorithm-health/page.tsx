import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminPeopleHref } from '@/constants/admin-navigation';

export const metadata: Metadata = {
  title: 'Algorithm Health',
};

export const runtime = 'nodejs';

export default function AlgorithmHealthPage() {
  redirect(buildAdminPeopleHref('creators'));
}
