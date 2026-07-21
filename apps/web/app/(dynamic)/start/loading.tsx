import { Skeleton } from '@jovie/ui';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';

/**
 * /start loading skeleton — mirrors the resolved anonymous onboarding empty
 * state (OnboardingShell → AppShellFrame shellChatV1 → OnboardingChat →
 * ChatEmptyStateComposerRegion) so the swap to the resolved page does not
 * reflow: same inset shell frame, same centered content column, same composer
 * anchor (712px box) and midline-anchored intro. No logo mark — the resolved
 * /start empty state renders its intro slot instead of the brand lockup.
 *
 * AppShellFrame is a server-safe presentational primitive (same import path
 * AppShellSkeleton uses from other loading boundaries); the skeleton interior
 * stays on named System B primitives so no client chat code enters the
 * loading bundle.
 */
export default function StartLoading() {
  return (
    <div
      className='system-b-start-loading-page'
      aria-busy='true'
      aria-live='polite'
      data-testid='start-loading-skeleton'
    >
      <AppShellFrame
        variant='shellChatV1'
        sidebar={null}
        containerClassName='[color-scheme:dark]'
        contentClassName='overflow-hidden!'
        main={
          <div className='system-b-start-loading-main'>
            <div className='system-b-start-loading-scroll'>
              <div className='system-b-start-loading-column'>
                <div
                  className='system-b-start-loading-region'
                  data-testid='chat-empty-state-composer-region'
                >
                  <div
                    className='system-b-start-loading-intro'
                    aria-hidden='true'
                    data-testid='start-loading-intro'
                  >
                    <div className='system-b-start-loading-intro-message'>
                      <Skeleton
                        className='system-b-start-loading-intro-line'
                        rounded='full'
                      />
                      <Skeleton
                        className='system-b-start-loading-intro-line'
                        rounded='full'
                      />
                    </div>
                    <div className='system-b-start-loading-intro-pills'>
                      <Skeleton
                        className='system-b-start-loading-intro-pill'
                        rounded='full'
                      />
                      <Skeleton
                        className='system-b-start-loading-intro-pill'
                        rounded='full'
                      />
                      <Skeleton
                        className='system-b-start-loading-intro-pill'
                        rounded='full'
                      />
                      <Skeleton
                        className='system-b-start-loading-intro-pill'
                        rounded='full'
                      />
                    </div>
                    <Skeleton
                      className='system-b-start-loading-intro-footer'
                      rounded='full'
                    />
                  </div>

                  <div
                    className='system-b-start-loading-composer-anchor'
                    data-testid='chat-empty-state-centered-composer'
                  >
                    <div className='system-b-start-loading-composer-wrap'>
                      <div
                        className='system-b-start-loading-composer'
                        aria-hidden='true'
                      >
                        <div className='system-b-start-loading-composer-row'>
                          <div className='system-b-start-loading-copy-slot'>
                            <Skeleton
                              className='system-b-start-loading-title-skeleton'
                              rounded='full'
                            />
                          </div>
                          <div className='system-b-start-loading-actions'>
                            <Skeleton
                              className='system-b-start-loading-action-skeleton'
                              rounded='full'
                            />
                            <Skeleton
                              className='system-b-start-loading-action-skeleton'
                              rounded='full'
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
