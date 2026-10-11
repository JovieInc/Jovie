import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { isCreatorFinanceEnabled } from '@/lib/finance/flags';
import { MoneyVisibilityProvider } from '@/lib/workspace-lock/money-visibility';
import {
  isMoneyHiddenCookieValue,
  MONEY_HIDDEN_COOKIE,
} from '@/lib/workspace-lock/workspace-lock';

export const dynamic = 'force-dynamic';

/**
 * Private Money layout (JOV-4618).
 *
 * Deliberately outside the `(shell)` group: no shared creator/workspace
 * navigation, loaders, or hydration payload ever touches this route. The
 * auth check runs before any finance payload is produced.
 */
export default async function MoneyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(APP_ROUTES.SIGNIN);
  }
  if (!(await isCreatorFinanceEnabled(userId))) {
    notFound();
  }

  const cookieStore = await cookies();
  const moneyHidden = isMoneyHiddenCookieValue(
    cookieStore.get(MONEY_HIDDEN_COOKIE)?.value
  );

  return (
    <MoneyVisibilityProvider hidden={moneyHidden}>
      <div className='min-h-screen bg-base text-foreground'>
        <main className='mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8'>
          {children}
        </main>
      </div>
    </MoneyVisibilityProvider>
  );
}
