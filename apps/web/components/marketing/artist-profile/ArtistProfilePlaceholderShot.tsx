import { cn } from '@/lib/utils';
import './ArtistProfilePlaceholderShot.css';

export type ArtistProfilePlaceholderVariant =
  | 'upcoming-release'
  | 'release-day'
  | 'touring'
  | 'live-support'
  | 'capture'
  | 'opinionated'
  | 'outcome-listen'
  | 'outcome-local'
  | 'outcome-support'
  | 'outcome-capture'
  | 'outcome-link';

interface ArtistProfilePlaceholderShotProps {
  readonly variant: ArtistProfilePlaceholderVariant;
  readonly className?: string;
}

function Block({
  className,
}: Readonly<{
  readonly className: string;
}>) {
  return <div className={cn('ap-placeholder-block rounded-full', className)} />;
}

function Panel({
  className,
}: Readonly<{
  readonly className: string;
}>) {
  return <div className={cn('ap-placeholder-panel', className)} />;
}

export function ArtistProfilePlaceholderShot({
  variant,
  className,
}: Readonly<ArtistProfilePlaceholderShotProps>) {
  if (variant === 'upcoming-release') {
    return (
      <div className={cn('flex h-full flex-col px-5 pb-5 pt-14', className)}>
        <Panel className='ap-placeholder-panel--soft h-40' />
        <Block className='mt-5 h-4 w-32' />
        <Block className='ap-placeholder-block--dim mt-2 h-3 w-44' />
        <Panel className='ap-placeholder-panel--raised mt-5 h-14' />
        <div className='mt-4 grid grid-cols-3 gap-3'>
          <Panel className='h-16' />
          <Panel className='h-16' />
          <Panel className='h-16' />
        </div>
      </div>
    );
  }

  if (variant === 'release-day') {
    return (
      <div className={cn('flex h-full flex-col px-5 pb-5 pt-14', className)}>
        <Panel className='ap-placeholder-panel--soft h-36' />
        <Block className='mt-5 h-4 w-30' />
        <div className='mt-5 space-y-3'>
          <Panel className='ap-placeholder-panel--bold h-11' />
          <Panel className='h-11' />
          <Panel className='h-11' />
          <Panel className='h-11' />
        </div>
      </div>
    );
  }

  if (variant === 'touring') {
    return (
      <div className={cn('flex h-full flex-col px-5 pb-5 pt-14', className)}>
        <Panel className='ap-placeholder-panel--bold h-16' />
        <div className='mt-4 space-y-3'>
          <Panel className='h-16' />
          <Panel className='h-16' />
          <Panel className='h-16' />
        </div>
        <Panel className='mt-auto h-14' />
      </div>
    );
  }

  if (variant === 'live-support') {
    return (
      <div className={cn('flex h-full flex-col px-5 pb-5 pt-14', className)}>
        <div className='ap-placeholder-tile mx-auto grid h-40 w-40 place-items-center'>
          <div className='ap-placeholder-block h-24 w-24 rounded-xl' />
        </div>
        <div className='mt-6 grid grid-cols-3 gap-3'>
          <Panel className='ap-placeholder-panel--bold h-14' />
          <Panel className='h-14' />
          <Panel className='h-14' />
        </div>
        <Panel className='mt-4 h-12' />
      </div>
    );
  }

  if (variant === 'capture') {
    return (
      <div className={cn('grid h-full gap-3 p-5', className)}>
        <Panel className='ap-placeholder-panel--strong h-18' />
        <Panel className='h-24' />
        <Panel className='h-24' />
        <Panel className='h-16' />
      </div>
    );
  }

  if (variant === 'opinionated') {
    return (
      <div className={cn('grid h-full gap-3 p-5', className)}>
        <Panel className='ap-placeholder-panel--raised h-28' />
        <div className='grid gap-3 sm:grid-cols-3'>
          <Panel className='h-20' />
          <Panel className='h-20' />
          <Panel className='h-20' />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('grid h-full gap-3 p-4', className)}>
      <Panel className='ap-placeholder-panel--raised h-24' />
      <Panel className='h-12' />
      <Panel className='h-12' />
    </div>
  );
}
