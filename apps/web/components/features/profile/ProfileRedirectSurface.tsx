import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

interface ProfileRedirectSurfaceProps {
  readonly title: string;
  readonly description: string;
  readonly helperText?: string;
}

export function ProfileRedirectSurface({
  title,
  description,
  helperText = 'This usually takes a moment.',
}: Readonly<ProfileRedirectSurfaceProps>) {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title={title}
          subtitle={description}
        />
        <div className='flex flex-col items-center gap-4 px-5 py-5 text-center sm:px-6'>
          <div className='flex h-12 w-12 items-center justify-center rounded-full border border-subtle bg-surface-0'>
            <LoadingSpinner size='lg' tone='primary' />
          </div>
          <p className='text-xs text-tertiary-token'>{helperText}</p>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
