import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const revalidate = false;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: APP_ROUTES.HOME },
};

/** Homepage v2 alias. The live identity homepage is `/`. */
export default function NewLandingPage(): never {
  redirect(APP_ROUTES.HOME);
}
