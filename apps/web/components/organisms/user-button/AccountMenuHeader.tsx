import { Badge, INSET_PANEL_ICON_COLUMN } from '@jovie/ui';
import { Avatar } from '../../molecules/Avatar/Avatar';

/** Row classes for the menu item that hosts the header. */
export const ACCOUNT_MENU_HEADER_ROW_CLASS =
  'h-auto min-w-0 gap-2 px-(--space-2-5) py-1.5';

export interface AccountMenuHeaderProps {
  readonly displayName: string;
  readonly userInitials: string;
  readonly userImageUrl: string | undefined;
  /** "@handle" when the account has one. */
  readonly formattedUsername: string | null;
  readonly contactEmail: string | undefined;
  readonly isPro: boolean;
}

/**
 * Identity block at the top of the account menu: avatar in the icon column,
 * name with the plan badge beside it, and the handle (or the email when there
 * is no handle) under it. With neither, there is no second line at all: the
 * header never reserves an empty row.
 */
export function AccountMenuHeader({
  displayName,
  userInitials,
  userImageUrl,
  formattedUsername,
  contactEmail,
  isPro,
}: AccountMenuHeaderProps) {
  const secondaryLine = formattedUsername ?? contactEmail ?? null;

  return (
    <>
      <span className={INSET_PANEL_ICON_COLUMN}>
        <Avatar
          src={userImageUrl}
          alt={displayName || 'User avatar'}
          name={displayName || userInitials}
          size='xs'
          className='shrink-0'
        />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-1.5'>
          <span
            title={displayName}
            className='min-w-0 truncate text-app font-medium leading-5 text-primary-token'
          >
            {displayName}
          </span>
          {isPro && (
            <Badge variant='secondary' size='sm' className='shrink-0'>
              Pro
            </Badge>
          )}
        </div>
        {secondaryLine ? (
          <p
            title={secondaryLine}
            className='truncate text-2xs leading-4 text-tertiary-token'
          >
            {secondaryLine}
          </p>
        ) : null}
      </div>
    </>
  );
}
