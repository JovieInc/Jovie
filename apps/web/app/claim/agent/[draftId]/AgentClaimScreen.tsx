import { Button } from '@jovie/ui';
import Image from 'next/image';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { agentClaimPath } from '@/lib/agent-acquisition/claim-path';
import type {
  AgentClaimPreview,
  AgentClaimView,
} from '@/lib/agent-acquisition/draft-claim.server';
import {
  type AgentClaimErrorCode,
  type AgentClaimStateCopy,
  agentClaimStateCopy,
  authHref,
} from './claim-states';

export interface AgentClaimScreenProps {
  readonly draftId: string;
  readonly handoff: string | null;
  readonly view: AgentClaimView;
  readonly signedIn: boolean;
  readonly error: AgentClaimErrorCode | null;
  readonly claimAction: (formData: FormData) => void | Promise<void>;
}

function StateCard({
  copy,
  hasPrimary = true,
}: {
  readonly copy: AgentClaimStateCopy;
  readonly hasPrimary?: boolean;
}) {
  return (
    <ContentSurfaceCard data-testid='agent-claim-state'>
      <ContentSectionHeader
        headingLevel='h1'
        title={copy.title}
        subtitle={copy.body}
      />
      <div className='flex flex-wrap gap-2 px-5 pb-5 sm:px-6'>
        {copy.actions.map((action, index) => (
          <Button
            key={action.href}
            asChild
            variant={hasPrimary && index === 0 ? 'primary' : 'secondary'}
            size='lg'
          >
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ))}
      </div>
    </ContentSurfaceCard>
  );
}

function DraftArtwork({ preview }: { readonly preview: AgentClaimPreview }) {
  const src = preview.release?.artworkUrl ?? preview.imageUrl;
  if (!src) return null;
  const isRelease = Boolean(preview.release?.artworkUrl);
  return (
    <div className='px-5 pb-4 sm:px-6'>
      {/* Square, uncropped art with no overlay (DESIGN.md art rules). */}
      <Image
        src={src}
        alt={
          isRelease
            ? `Artwork for ${preview.release?.title ?? preview.artistName}`
            : preview.artistName
        }
        width={96}
        height={96}
        className={
          isRelease
            ? 'size-24 rounded-md object-contain'
            : 'size-24 rounded-full object-cover'
        }
      />
    </div>
  );
}

function DraftPreview({ preview }: { readonly preview: AgentClaimPreview }) {
  const links = Object.entries(preview.release?.links ?? {});
  return (
    <>
      <DraftArtwork preview={preview} />
      <dl
        className='space-y-3 px-5 pb-5 text-sm sm:px-6'
        data-testid='agent-claim-preview'
      >
        <div>
          <dt className='text-tertiary-token'>Artist</dt>
          <dd className='text-primary-token'>{preview.artistName}</dd>
        </div>
        {preview.release?.title ? (
          <div>
            <dt className='text-tertiary-token'>Release</dt>
            <dd className='text-primary-token'>
              {preview.release.title}
              {preview.release.releaseDate
                ? ` (${preview.release.releaseDate})`
                : ''}
            </dd>
          </div>
        ) : null}
        {links.length > 0 ? (
          <div>
            <dt className='text-tertiary-token'>Smart Link Destinations</dt>
            <dd>
              <ul className='space-y-1' data-testid='agent-claim-links'>
                {links.map(([provider, url]) => (
                  <li key={provider} className='break-all text-primary-token'>
                    <span className='text-secondary-token'>{provider}: </span>
                    {url}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className='text-tertiary-token'>Draft Kept Until</dt>
          <dd className='text-primary-token tabular-nums'>
            {preview.expiresAt.slice(0, 10)}
          </dd>
        </div>
      </dl>
    </>
  );
}

/**
 * Presentational claim screen for every state. The route loads the state
 * server-side; Storybook renders each state from fixtures.
 */
export function AgentClaimScreen({
  draftId,
  handoff,
  view,
  signedIn,
  error,
  claimAction,
}: AgentClaimScreenProps) {
  if (view.state === 'invalid' || view.state === 'expired') {
    return (
      <StandaloneProductPage width='sm' centered>
        <StateCard copy={agentClaimStateCopy(view.state)} />
      </StandaloneProductPage>
    );
  }

  if (view.state === 'claimed') {
    return (
      <StandaloneProductPage width='sm' centered>
        {view.ownedByViewer ? (
          <StateCard
            copy={{
              title: 'This Profile Is Yours',
              body: view.handle
                ? `You claimed this draft as @${view.handle}.`
                : 'You already claimed this draft.',
              actions: [
                { label: 'Open Dashboard', href: APP_ROUTES.DASHBOARD },
              ],
            }}
          />
        ) : (
          <StateCard copy={agentClaimStateCopy('already_claimed')} />
        )}
      </StandaloneProductPage>
    );
  }

  const claimPath = agentClaimPath(draftId, handoff ?? '');
  // One primary action per screen: claim when signed in, sign up otherwise.
  const primaryAction = (
    <Button
      asChild={!signedIn}
      type={signedIn ? 'submit' : undefined}
      variant='primary'
      size='lg'
    >
      {signedIn ? (
        'Claim This Draft'
      ) : (
        <Link href={authHref(APP_ROUTES.SIGNUP, claimPath)}>
          Sign Up To Claim
        </Link>
      )}
    </Button>
  );
  return (
    <StandaloneProductPage width='sm' centered>
      <div className='space-y-4' data-testid='agent-claim-page'>
        {error ? (
          <StateCard copy={agentClaimStateCopy(error)} hasPrimary={false} />
        ) : null}
        <ContentSurfaceCard className='overflow-hidden'>
          <ContentSectionHeader
            headingLevel={error ? 'h2' : 'h1'}
            title='Claim Your Draft'
            subtitle='Your assistant prepared this draft. Claiming matches you to this Spotify artist (well-known artists go through a verification step first). Your profile and release stay private until you publish them from your dashboard.'
          />
          <DraftPreview preview={view.preview} />
          <div className='flex flex-wrap gap-2 px-5 pb-5 sm:px-6'>
            {signedIn ? (
              <form action={claimAction}>
                <input type='hidden' name='draftId' value={draftId} />
                <input type='hidden' name='h' value={handoff ?? ''} />
                <input type='hidden' name='p' value={view.preview.digest} />
                {primaryAction}
              </form>
            ) : (
              <>
                {primaryAction}
                <Button asChild variant='secondary' size='lg'>
                  <Link href={authHref(APP_ROUTES.SIGNIN, claimPath)}>
                    Sign In
                  </Link>
                </Button>
              </>
            )}
          </div>
        </ContentSurfaceCard>
      </div>
    </StandaloneProductPage>
  );
}
