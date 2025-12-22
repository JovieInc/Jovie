import { BrandLogo } from '@/components/atoms/BrandLogo';

export default function Loading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <BrandLogo
        size={48}
        tone='auto'
        alt='Loading'
        priority
        className='animate-in fade-in duration-1000'
      />
    </div>
  );
}
// Trigger CI
