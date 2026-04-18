import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export default function CatalogScanPage() {
  redirect(APP_ROUTES.PRESENCE);
}
