import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildAdminPeopleHref } from '@/constants/admin-navigation';

export const metadata: Metadata = {
  title: 'Feedback | Admin',
};

export const runtime = 'nodejs';

export default function AdminFeedbackRedirectPage() {
  redirect(buildAdminPeopleHref('feedback'));
}
