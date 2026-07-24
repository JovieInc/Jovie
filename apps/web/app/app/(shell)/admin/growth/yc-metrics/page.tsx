import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'YC Command Center',
};

export const runtime = 'nodejs';

export default function YcMetricsPage() {
  redirect(APP_ROUTES.ADMIN);
}
