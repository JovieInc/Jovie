import type { Metadata } from 'next';
import { DashboardHomeShell } from './DashboardHomeShell';

const DASHBOARD_DESCRIPTION = 'Start a new thread with Jovie AI';
const DASHBOARD_TITLE = 'Home | Jovie';

export function generateMetadata(): Metadata {
  return {
    title: DASHBOARD_TITLE,
    description: DASHBOARD_DESCRIPTION,
  };
}

export default function AppRootPage() {
  return <DashboardHomeShell />;
}
