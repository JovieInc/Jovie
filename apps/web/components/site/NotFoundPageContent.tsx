import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import {
  getNotFoundCopy,
  type NotFoundVariant,
} from '@/lib/routing/not-found-copy';

type NotFoundSurface = 'root' | 'profile';

interface NotFoundPageContentProps {
  readonly variant: NotFoundVariant;
  readonly surface: NotFoundSurface;
}

const SURFACE_CLASS_PREFIX = {
  root: 'system-b-root-not-found',
  profile: 'system-b-public-profile-not-found',
} as const satisfies Record<NotFoundSurface, string>;

export function NotFoundPageContent({
  variant,
  surface,
}: Readonly<NotFoundPageContentProps>) {
  const copy = getNotFoundCopy(variant);
  const prefix = SURFACE_CLASS_PREFIX[surface];

  return (
    <>
      {surface === 'root' ? (
        <div className={`${prefix}-code-wrap`}>
          <span className={`${prefix}-code`} aria-hidden='true'>
            404
          </span>
        </div>
      ) : (
        <p className={`${prefix}-code`}>404</p>
      )}

      <div className={`${prefix}-copy`}>
        <h1 className={`${prefix}-title`}>{copy.title}</h1>
        <p className={`${prefix}-description`}>{copy.description}</p>

        <div className={`${prefix}-actions`}>
          <Link href={APP_ROUTES.HOME} className={`${prefix}-action`}>
            Go home
          </Link>
          <Link
            href={APP_ROUTES.ARTIST_PROFILES}
            className={`${prefix}-action-secondary`}
          >
            Search artists
          </Link>
        </div>
      </div>
    </>
  );
}
