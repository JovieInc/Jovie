import { ReleasesRoute } from '../dashboard/releases/ReleasesRoute';

export const runtime = 'nodejs';

export default async function ReleasesPage() {
  return <ReleasesRoute />;
}
