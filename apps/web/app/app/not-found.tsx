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
          heading="This page missed its cue"
          description="We can't find this one in the lineup. But don't worry, your dashboard is ready for an encore!"
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
