import { redirect } from 'next/navigation';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';

export default function AdminOutreachRedirectPage() {
  redirect(buildAdminGrowthHref('outreach'));
}
