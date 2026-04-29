import { permanentRedirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const revalidate = false;

export default function MarketingSectionsPage() {
  permanentRedirect(APP_ROUTES.EXP_DESIGN_STUDIO);
}
