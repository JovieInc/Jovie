import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface EmptyStateCardProps {
  title: string;
  description: string;
  ctaText: string;
  onCtaClick?: () => void;
  ctaHref?: string;
  icon: React.ReactNode;
  className?: string;
}

export function EmptyStateCard({
  title,
  description,
  ctaText,
  onCtaClick,
  ctaHref,
  icon,
  className,
}: EmptyStateCardProps) {
  const content = (
    <div className='flex flex-col items-center text-center p-6 rounded-lg border-2 border-dashed border-subtle bg-surface-1 hover:bg-surface-2 transition-colors'>
      <div className='flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-3'>
        {icon}
      </div>
      <h3 className='text-sm font-medium text-primary-token mb-1'>{title}</h3>
      <p className='text-sm text-tertiary-token mb-4 max-w-xs'>{description}</p>
      <Button
        variant='outline'
        size='sm'
        className='gap-1.5 group'
        onClick={onCtaClick}
      >
        <Icon name='PlusCircle' className='h-3.5 w-3.5' />
        {ctaText}
      </Button>
    </div>
  );

  if (ctaHref) {
    return (
      <Link href={ctaHref} className={cn('block', className)}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

// Music-specific empty state
export function MusicEmptyState({
  onAddMusic,
  className,
}: {
  onAddMusic?: () => void;
  className?: string;
}) {
  return (
    <EmptyStateCard
      title='No music services yet'
      description='Add your Spotify, Apple Music, or other music platform links to share your music with your audience.'
      ctaText='Add music service'
      onCtaClick={onAddMusic}
      icon={
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='24'
          height='24'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          className='h-5 w-5'
        >
          <path d='M9 18V5l12-2v13' />
          <circle cx='6' cy='18' r='3' />
          <circle cx='18' cy='16' r='3' />
        </svg>
      }
      className={className}
    />
  );
}
