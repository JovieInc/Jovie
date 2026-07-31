'use client';

import { Button, Input } from '@jovie/ui';
import {
  Cable,
  CalendarDays,
  ChevronLeft,
  Link2,
  Mail,
  Plus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState } from 'react';
import {
  DrawerSection,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { APP_ROUTES } from '@/constants/routes';
import { getConnectorDefinitions } from '@/lib/connectors/registry';
import { canonicalizeSurfaceUrl } from '@/lib/profile-surfaces/contracts';
import { cn } from '@/lib/utils';
import type { ProfilesWorkspaceData } from './data';

type AddConnectionView = 'home' | 'services' | 'profile';

function ConnectorIcon({
  iconKey,
  className,
}: Readonly<{ iconKey: 'mail' | 'calendar'; className?: string }>) {
  const Icon = iconKey === 'mail' ? Mail : CalendarDays;
  return <Icon className={className} aria-hidden />;
}

function ChoiceRow({
  icon,
  title,
  description,
  onClick,
}: Readonly<{
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}>) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50'
    >
      <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-secondary-token group-hover:text-accent'>
        {icon}
      </span>
      <span className='min-w-0 space-y-0.5'>
        <span className='block text-sm font-medium text-primary-token'>
          {title}
        </span>
        <span className='block text-xs leading-5 text-secondary-token'>
          {description}
        </span>
      </span>
    </button>
  );
}

/**
 * In-flow add surface for the Connections workspace. Provider availability is
 * intentionally derived from the connector registry: unsupported DSP/social
 * services never appear as implied integrations.
 */
export function AddConnectionRail({
  data,
  onClose,
  onReviewSuggestions,
}: Readonly<{
  data: ProfilesWorkspaceData;
  onClose: () => void;
  onReviewSuggestions: () => void;
}>) {
  const router = useRouter();
  const [view, setView] = useState<AddConnectionView>('home');
  const [profileUrl, setProfileUrl] = useState('');
  const canonicalUrl = useMemo(
    () => canonicalizeSurfaceUrl(profileUrl),
    [profileUrl]
  );
  const suggestedCount = data.rows.filter(
    row => row.rowType === 'surface' && row.qualificationStatus === 'suggested'
  ).length;
  const connectors = getConnectorDefinitions();

  const title =
    view === 'services'
      ? 'Connect services'
      : view === 'profile'
        ? 'Add public profile'
        : 'Add connection';

  return (
    <EntitySidebarShell
      isOpen
      ariaLabel='Add connection'
      scrollStrategy='shell'
      workspaceSurface='raised'
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      entityHeader={
        <EntityHeaderCard
          image={
            <div className='flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-accent'>
              <Plus className='h-4 w-4' aria-hidden />
            </div>
          }
          title={title}
          subtitle='Connections'
          stableLayout
          reserveSubtitleSlot
          actions={
            <DrawerHeaderActions
              primaryActions={
                view === 'home'
                  ? []
                  : [
                      {
                        id: 'back',
                        label: 'Back',
                        icon: ChevronLeft,
                        onClick: () => setView('home'),
                      },
                    ]
              }
              overflowActions={[]}
              onClose={onClose}
            />
          }
          bodyClassName='pr-8'
          data-testid='profiles-add-connection-header'
        />
      }
    >
      {view === 'home' ? (
        <DrawerSection sectionKind='details' surface='plain' className='py-1'>
          <ChoiceRow
            icon={<CableIcon />}
            title='Connect services'
            description='Connect the services Jovie can securely support today.'
            onClick={() => setView('services')}
          />
          <ChoiceRow
            icon={<Link2 className='h-4 w-4' aria-hidden />}
            title='Add public profile'
            description='Add a public URL with canonicalization before review.'
            onClick={() => setView('profile')}
          />
          <ChoiceRow
            icon={<ReviewIcon />}
            title='Review suggestions'
            description={
              suggestedCount > 0
                ? `${suggestedCount} suggested ${suggestedCount === 1 ? 'profile' : 'profiles'} to review.`
                : 'No suggested profiles are waiting for review.'
            }
            onClick={onReviewSuggestions}
          />
        </DrawerSection>
      ) : null}

      {view === 'services' ? (
        <DrawerSection sectionKind='details' surface='plain' className='py-1'>
          <div className='divide-y divide-subtle'>
            {connectors.map(connector => (
              <button
                key={connector.id}
                type='button'
                onClick={() =>
                  router.push(
                    `/api/connectors/google/authorize?returnTo=${encodeURIComponent(APP_ROUTES.PROFILES)}`
                  )
                }
                className='flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50'
              >
                <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-secondary-token'>
                  <ConnectorIcon
                    iconKey={connector.iconKey}
                    className='h-4 w-4'
                  />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block text-sm font-medium text-primary-token'>
                    {connector.label}
                  </span>
                  <span className='block text-xs leading-5 text-secondary-token'>
                    {connector.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DrawerSection>
      ) : null}

      {view === 'profile' ? (
        <DrawerSection title='Public URL' sectionKind='details' surface='plain'>
          <div className='space-y-2 px-3 pb-2'>
            <Input
              aria-label='Public profile URL'
              autoComplete='url'
              inputMode='url'
              placeholder='https://…'
              value={profileUrl}
              onChange={event => setProfileUrl(event.target.value)}
            />
            {profileUrl ? (
              canonicalUrl ? (
                <p className='text-xs leading-5 text-secondary-token'>
                  Canonical URL:{' '}
                  <span className='break-all text-primary-token'>
                    {canonicalUrl.url}
                  </span>
                </p>
              ) : (
                <p className='text-xs leading-5 text-error'>
                  Enter a public http or https URL without credentials.
                </p>
              )
            ) : null}
            <p className='text-xs leading-5 text-tertiary-token'>
              Jovie will classify the URL before it is added. Service
              connections are only available from the supported list above.
            </p>
            <Button
              type='button'
              size='sm'
              className={cn('w-full')}
              disabled={!canonicalUrl}
              onClick={onReviewSuggestions}
            >
              Review profile
            </Button>
          </div>
        </DrawerSection>
      ) : null}
    </EntitySidebarShell>
  );
}

function CableIcon() {
  return <Cable className='h-4 w-4' aria-hidden />;
}

function ReviewIcon() {
  return <Link2 className='h-4 w-4' aria-hidden />;
}
