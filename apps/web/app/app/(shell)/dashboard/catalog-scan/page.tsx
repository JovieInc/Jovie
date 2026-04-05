import { CatalogScanView } from '@/components/features/dashboard/organisms/catalog-scan/CatalogScanView';
import { loadCatalogScanData } from './actions';

export default async function CatalogScanPage() {
  const data = await loadCatalogScanData();
  return <CatalogScanView data={data} />;
}
