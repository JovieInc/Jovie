import type { Metadata } from 'next';
import { getSessionContext } from '@/lib/auth/session';
import { DashboardHomeShell } from './DashboardHomeShell';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';
const DASHBOARD_TITLE = 'Home | Jovie';

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getSessionContext({
    requireProfile: false,
    requireUser: false,
  }).catch(() => ({ profile: null }));

  const displayName = profile?.displayName?.trim();

  return {
    title: displayName ? `${displayName} | Jovie` : DASHBOARD_TITLE,
    description: DASHBOARD_DESCRIPTION,
  };
}

export default function AppRootPage() {
  return <DashboardHomeShell />;
}
