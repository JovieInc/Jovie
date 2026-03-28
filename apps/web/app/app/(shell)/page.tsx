import type { Metadata } from 'next';
import { DashboardHomeShell } from './DashboardHomeShell';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';

export const metadata: Metadata = {
  title: 'Home | Jovie',
  description: DASHBOARD_DESCRIPTION,
};

export default function AppRootPage() {
  return <DashboardHomeShell />;
}
