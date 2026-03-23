import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

export default function SpinnerTestPage() {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title='Spinner test'
          subtitle='Preview the standalone loading spinner at /spinner-test.'
        />

        <div className='space-y-5 px-5 py-5 text-center sm:px-6'>
          <div className='flex justify-center'>
            <div className='rounded-[14px] border border-subtle bg-surface-0 p-6'>
              <svg
                width='64'
                height='64'
                viewBox='0 0 44 44'
                xmlns='http://www.w3.org/2000/svg'
                aria-hidden='true'
              >
                <style>
                  {
                    '.spinner{transform-origin:50% 50%;animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}'
                  }
                </style>
                <defs>
                  <linearGradient
                    id='spinnerTail'
                    x1='22'
                    y1='2'
                    x2='22'
                    y2='42'
                    gradientUnits='userSpaceOnUse'
                    gradientTransform='rotate(-40 22 22)'
                  >
                    <stop offset='0%' stopColor='white' stopOpacity='1' />
                    <stop offset='70%' stopColor='white' stopOpacity='1' />
                    <stop offset='100%' stopColor='white' stopOpacity='0' />
                  </linearGradient>
                </defs>
                <g className='spinner'>
                  <circle
                    cx='22'
                    cy='22'
                    r='14'
                    fill='none'
                    stroke='url(#spinnerTail)'
                    strokeWidth='8'
                    strokeLinecap='round'
                    strokeDasharray='80 16'
                  />
                </g>
              </svg>
            </div>
          </div>

          <p className='text-[13px] leading-5 text-secondary-token'>
            This route exists to verify the tail-weighted spinner treatment in
            isolation.
          </p>

          <p className='text-[12px] text-tertiary-token'>
            View at /spinner-test
          </p>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
