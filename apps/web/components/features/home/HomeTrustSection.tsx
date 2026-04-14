import { Container } from '@/components/site/Container';
import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from './label-logos';

const LOGO_CLASS =
  'select-none text-primary-token opacity-[0.35] transition-opacity duration-300 hover:opacity-[0.55]';

export function HomeTrustSection() {
  return (
    <section
      data-testid='homepage-trust'
      className='homepage-trust-strip'
      aria-label='Trusted by artists on'
    >
      <Container size='homepage'>
        <div className='homepage-trust-logos mx-auto max-w-[1200px]'>
          <AwalLogo className={`${LOGO_CLASS} h-[15px] w-auto`} />
          <TheOrchardLogo className={`${LOGO_CLASS} h-[19px] w-auto`} />
          <UniversalMusicGroupLogo
            className={`${LOGO_CLASS} h-[11px] w-auto`}
          />
          <ArmadaMusicLogo className={`${LOGO_CLASS} h-[13px] w-auto`} />
        </div>
      </Container>
    </section>
  );
}
