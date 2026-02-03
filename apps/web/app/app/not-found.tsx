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
          heading='Page not found'
          description="The page you're looking for doesn't exist or has been moved."
          action={{
            label: 'Go to Dashboard',
            href: APP_ROUTES.DASHBOARD,
          }}
          secondaryAction={{
            label: 'Contact Support',
            href: 'mailto:support@jovie.fm',
          }}
        />
      </PageContent>
    </PageShell>
  );
}
