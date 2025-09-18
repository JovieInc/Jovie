import { EnhancedDashboardLinks } from '@/components/dashboard/organisms/EnhancedDashboardLinks';
import { getDashboardData, getProfileSocialLinks } from '../actions';

export default async function LinksPage() {
  // Fetch dashboard data server-side
  const dashboardData = await getDashboardData();

  // Fetch initial links for the selected profile on the server
  const profileId = dashboardData.selectedProfile?.id;
  const initialLinks = profileId ? await getProfileSocialLinks(profileId) : [];

  // Pass server-fetched data to enhanced client component
  return (
    <EnhancedDashboardLinks
      initialData={dashboardData}
      initialLinks={initialLinks}
    />
  );
}
