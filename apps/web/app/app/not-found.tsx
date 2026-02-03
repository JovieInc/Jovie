import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/organisms/EmptyState';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { APP_ROUTES } from '@/constants/routes';

export default function AppNotFound() {
  return (
    <PageShell>
      <PageContent>
        <EmptyState
          icon={<FileQuestion className='h-10 w-10' />}
          heading='Oops, this page took a detour'
          description="We can't find what you're looking for, but don't worry—your dashboard is just a click away!"
          action={{
            label: 'Back to Dashboard',
            href: APP_ROUTES.DASHBOARD,
          }}
          secondaryAction={{
            label: 'Need help?',
            href: 'mailto:support@jovie.fm',
          }}
        />
      </PageContent>
    </PageShell>
  );
}
