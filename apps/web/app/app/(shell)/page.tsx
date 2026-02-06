import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Dashboard',
  description: 'Manage your Jovie profile',
};

// eslint-disable-next-line @jovie/no-hardcoded-routes -- Legacy dashboard path for redirect
const PROFILE_ROUTE = '/app/dashboard/profile';

// Redirect to profile page - the new default home
export default function AppRootPage() {
  redirect(PROFILE_ROUTE);
}
