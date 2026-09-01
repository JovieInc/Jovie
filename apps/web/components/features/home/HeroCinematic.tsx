import type { ReactNode } from 'react';
import { Container } from '@/components/site/Container';
import { HeroClaimHandle } from './HeroClaimHandle';
import { HeroDesktopPreviewMount } from './HeroDesktopPreviewMount';

interface HeroCinematicProps {
  readonly fullScreen?: boolean;
  readonly primaryAction?: ReactNode;
}

interface HeroCinematicShellProps {
  readonly fullScreen: boolean;
  readonly children: ReactNode;
}

interface HeroCinematicCopyProps {
  readonly heroPrimaryAction: ReactNode;
  readonly headingClassName: string;
  readonly headingContent: ReactNode;
  readonly leadClassName: string;
  readonly actionClassName: string;
  readonly proofClassName: string;
}

const FULLSCREEN_SHELL_CLASSNAME =
  'relative overflow-hidden lg:flex lg:h-[calc(100dvh-var(--linear-header-height))] lg:flex-col';
const STANDARD_SHELL_CLASSNAME =
  'relative overflow-hidden pb-0 pt-[5.5rem] md:pt-[6.1rem] lg:pt-[6.6rem]';
const STANDARD_HEADING_CLASSNAME =
  'marketing-h1-linear hero-gradient-text mt-5 lg:text-left';
const STANDARD_LEAD_CLASSNAME =
  'marketing-lead-linear max-lg:mx-auto mt-4 max-w-[31rem] text-secondary-token md:mt-5 lg:mx-0';
const STANDARD_ACTION_CLASSNAME =
  'max-lg:mx-auto mt-6 w-full max-w-[27rem] md:mt-7 lg:mx-0';
const STANDARD_PROOF_CLASSNAME =
  'mt-3.5 block text-2xs tracking-wide text-quaternary-token md:mt-4 lg:text-left';
const MOBILE_HEADING_CLASSNAME =
  'marketing-h1-linear mt-3 text-left text-primary-token sm:mt-4';
const MOBILE_LEAD_CLASSNAME =
  'marketing-lead-linear mt-2 max-w-[28rem] text-secondary-token sm:mt-3';
const MOBILE_PROOF_CLASSNAME =
  'mt-2.5 block text-2xs tracking-wide text-quaternary-token sm:mt-3';
const DESKTOP_HEADING_CLASSNAME =
  'marketing-h1-linear hero-gradient-text mt-3 max-w-[11ch] text-left sm:mt-4 lg:mt-5';
const DESKTOP_LEAD_CLASSNAME =
  'marketing-lead-linear mt-2 max-w-[30rem] text-mid text-secondary-token sm:mt-3 sm:text-lg md:mt-4';

function HeroCinematicShell({ fullScreen, children }: HeroCinematicShellProps) {
  const shellClassName = fullScreen
    ? FULLSCREEN_SHELL_CLASSNAME
    : STANDARD_SHELL_CLASSNAME;

  return (
    <section className={shellClassName} data-testid='homepage-shell'>
      {children}
    </section>
  );
}

function HeroCinematicCopy({
  heroPrimaryAction,
  headingClassName,
  headingContent,
  leadClassName,
  actionClassName,
  proofClassName,
}: HeroCinematicCopyProps) {
  return (
    <>
      <span className='homepage-section-eyebrow'>
        Built for independent artists
      </span>

      <h1
        className={`line-clamp-2 ${headingClassName}`}
        data-testid='hero-heading'
      >
        {headingContent}
      </h1>

      <p className={leadClassName}>
        Smart links, release automation, and fan insight that keep every launch
        moving.
      </p>

      <div className={actionClassName}>{heroPrimaryAction}</div>

      <span className={proofClassName}>
        Private launch access with your artist page and next release ready to
        go.
      </span>
    </>
  );
}

export function HeroCinematic({
  fullScreen = false,
  primaryAction,
}: Readonly<HeroCinematicProps>) {
  const heroPrimaryAction = primaryAction ?? (
    <HeroClaimHandle submitButtonTestId='homepage-primary-cta' />
  );

  if (!fullScreen) {
    return (
      <HeroCinematicShell fullScreen={false}>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0'
          style={{ background: 'var(--linear-hero-backdrop)' }}
        />
        <div className='hero-glow pointer-events-none absolute inset-0' />

        <Container size='homepage'>
          <div className='mx-auto max-w-300'>
            <div className='hero-stagger'>
              <div className='flex max-lg:flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16'>
                <div className='max-w-[44rem] max-lg:text-center lg:flex-1 lg:text-left'>
                  <HeroCinematicCopy
                    heroPrimaryAction={heroPrimaryAction}
                    headingClassName={STANDARD_HEADING_CLASSNAME}
                    headingContent='The Link Your Music Deserves.'
                    leadClassName={STANDARD_LEAD_CLASSNAME}
                    actionClassName={STANDARD_ACTION_CLASSNAME}
                    proofClassName={STANDARD_PROOF_CLASSNAME}
                  />
                </div>

                <div className='relative flex-shrink-0 lg:flex-none'>
                  <div
                    style={{
                      filter:
                        'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                    }}
                  >
                    <HeroDesktopPreviewMount />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </HeroCinematicShell>
    );
  }

  return (
    <HeroCinematicShell fullScreen>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-0 max-lg:hidden' />

      <div className='relative z-10 mx-auto w-full max-w-(--linear-content-max) px-5 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10 lg:hidden'>
        <div className='max-w-[30rem] text-left'>
          <HeroCinematicCopy
            heroPrimaryAction={heroPrimaryAction}
            headingClassName={MOBILE_HEADING_CLASSNAME}
            headingContent={
              <>
                <span className='block'>The link your music</span>
                <span className='block'>deserves.</span>
              </>
            }
            leadClassName={MOBILE_LEAD_CLASSNAME}
            actionClassName='mt-4 w-full max-w-[27rem] sm:mt-5'
            proofClassName={MOBILE_PROOF_CLASSNAME}
          />
        </div>
      </div>

      <div className='relative z-10 max-lg:hidden min-h-0 flex-1 items-center justify-center w-full lg:flex'>
        <div className='mx-auto w-full max-w-(--linear-content-max) px-5 sm:px-6 lg:px-0'>
          <div className='grid grid-cols-2 items-center gap-0'>
            <div className='max-w-[31rem] text-left'>
              <HeroCinematicCopy
                heroPrimaryAction={heroPrimaryAction}
                headingClassName={DESKTOP_HEADING_CLASSNAME}
                headingContent='The Link Your Music Deserves.'
                leadClassName={DESKTOP_LEAD_CLASSNAME}
                actionClassName='mt-4 w-full max-w-[27rem] sm:mt-5 md:mt-6'
                proofClassName={MOBILE_PROOF_CLASSNAME}
              />
            </div>

            <div className='relative justify-self-end'>
              <div
                style={{
                  filter:
                    'drop-shadow(0 25px 60px rgba(0,0,0,0.35)) drop-shadow(0 8px 30px rgba(94,106,210,0.15))',
                }}
              >
                <HeroDesktopPreviewMount />
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav
        className='relative z-10 max-lg:hidden items-center justify-center gap-1 pb-5 lg:flex'
        aria-label='Phone Mode Tabs'
      >
        {['/profile', '/tour', '/tip', '/listen'].map((label, i) => (
          <span
            key={label}
            className='rounded-full px-3 py-1 text-2xs font-mono tracking-tighter transition-colors duration-slower'
            style={{
              backgroundColor:
                i === 0 ? 'var(--linear-bg-surface-2)' : 'transparent',
              color:
                i === 0
                  ? 'var(--linear-text-primary)'
                  : 'var(--linear-text-quaternary)',
              border:
                i === 0
                  ? '1px solid var(--linear-border-default)'
                  : '1px solid transparent',
            }}
          >
            {label}
          </span>
        ))}
      </nav>
    </HeroCinematicShell>
  );
}
