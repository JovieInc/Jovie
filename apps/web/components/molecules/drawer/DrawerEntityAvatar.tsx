import { EntityHeaderThumbnail } from './EntityHeader';

export interface DrawerEntityAvatarProps {
  readonly name: string;
  readonly src?: string | null;
  readonly verified?: boolean;
  readonly testId?: string;
}

/** Compatibility adapter: compact person rails share the canonical identity owner. */
export function DrawerEntityAvatar({
  name,
  src,
  verified,
  testId,
}: DrawerEntityAvatarProps) {
  return (
    <EntityHeaderThumbnail
      variant='person'
      name={name}
      src={src}
      verified={verified}
      data-testid={testId}
    />
  );
}
