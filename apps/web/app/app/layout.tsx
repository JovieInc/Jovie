import { auth, currentUser } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { db, waitlistEntries } from '@/lib/db';
import { MyStatsig } from '../my-statsig';
import {
  getDashboardDataCached,
  prefetchDashboardData,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import DashboardLayoutClient from './dashboard/DashboardLayoutClient';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function ensureWaitlistAccess(): Promise<void> {
  return Sentry.startSpan(
    { op: 'waitlist', name: 'app.waitlistAccess' },
    async () => {
      try {
        const user = await currentUser();
        const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;

        if (!emailRaw) {
          redirect('/waitlist');
        }

        const email = normalizeEmail(emailRaw);
        const [entry] = await db
          .select({ id: waitlistEntries.id, status: waitlistEntries.status })
          .from(waitlistEntries)
          .where(drizzleSql`lower(${waitlistEntries.email}) = ${email}`)
          .limit(1);

        const status = entry?.status ?? null;
        const isApproved = status === 'invited' || status === 'claimed';
        if (!isApproved) {
          redirect('/waitlist');
        }

        if (status === 'invited' && entry?.id) {
          try {
            await db
              .update(waitlistEntries)
              .set({ status: 'claimed', updatedAt: new Date() })
              .where(eq(waitlistEntries.id, entry.id));
          } catch (error) {
            // Non-blocking; log in development for easier debugging.
            if (process.env.NODE_ENV === 'development') {
              console.warn('Failed to mark waitlist entry as claimed', error);
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
          throw error;
        }

        Sentry.captureException(error, {
          tags: { context: 'waitlist_gate' },
        });
      }
    }
  );
}

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard');
  }

  const waitlistPromise = ensureWaitlistAccess();
  prefetchDashboardData();

  try {
    const [dashboardData] = await Promise.all([
      getDashboardDataCached(),
      waitlistPromise,
    ]);

    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    return (
      <MyStatsig userId={userId}>
        <DashboardDataProvider value={dashboardData}>
          <DashboardLayoutClient
            dashboardData={dashboardData}
            persistSidebarCollapsed={setSidebarCollapsed}
          >
            {children}
          </DashboardLayoutClient>
        </DashboardDataProvider>
      </MyStatsig>
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading app shell:', error);

    return (
      <div className='min-h-screen bg-base flex items-center justify-center px-6'>
        <div className='w-full max-w-lg space-y-4'>
          <ErrorBanner
            title='Dashboard failed to load'
            description='We could not load your workspace data. Refresh to try again or return to your profile.'
            actions={[
              { label: 'Retry', href: '/app/dashboard' },
              { label: 'Go to my profile', href: '/' },
            ]}
            testId='dashboard-error'
          />
          <p className='text-sm text-secondary-token text-center'>
            If this keeps happening, please reach out to support so we can help
            restore access.
          </p>
        </div>
      </div>
    );
  }
}
