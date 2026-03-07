import type { Metadata } from 'next';
import { getRecentIngestHistory } from '@/lib/admin/ingest-history';
import { AdminIngestPageClient } from './AdminIngestPageClient';

export const metadata: Metadata = {
  title: 'Admin ingest',
};

export const runtime = 'nodejs';

export default async function AdminIngestPage() {
  const history = await getRecentIngestHistory(50);

  return <AdminIngestPageClient history={history} />;
}
