import { Container } from '@/components/site/Container';

import {
  ArmadaMusicLogo,
  AwalLogo,
  SonyMusicLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

export function LabelLogosBar() {
  return (
    <section
      aria-label='Record labels the founder has released on'
      className='bg-[var(--linear-bg-page)] pb-10 pt-0 sm:pb-14'
    >
      <Container size='homepage'>
        {/* Centered gradient separator — Linear uses subtle gradient dividers */}
        <div
          aria-hidden='true'
          className='mb-8 h-px sm:mb-10'
          style={{
            background:
              'linear-gradient(to right, transparent, var(--linear-separator-via), transparent)',
          }}
        />

        <p
          className='mb-5 text-center uppercase'
          style={{
            fontSize: '13px',
            fontWeight: 510,
            letterSpacing: '0.08em',
            color: 'var(--linear-text-tertiary)',
          }}
        >
          Built by an artist who&apos;s released on
        </p>

        <div className='flex flex-wrap items-center justify-center gap-x-10 gap-y-5'>
          <div>
            <SonyMusicLogo
              className='h-4 w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </div>
          <div>
            <UniversalMusicGroupLogo
              className='h-3 w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </div>
          <div>
            <AwalLogo
              className='h-[18px] w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </div>
          <div>
            <ArmadaMusicLogo
              className='h-5 w-auto select-none transition-opacity duration-[160ms] hover:opacity-70'
              style={{ color: 'var(--linear-text-tertiary)' }}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
