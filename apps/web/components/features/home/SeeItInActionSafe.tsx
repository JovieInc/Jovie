import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { FALLBACK_AVATARS } from './featured-creators-fallback';
import { HomeLiveProofSection } from './HomeLiveProofSection';

interface SeeItInActionSafeProps {
  readonly enabled?: boolean;
}

export function SeeItInActionSafe({
  enabled,
}: Readonly<SeeItInActionSafeProps>) {
  const showSection = enabled ?? FEATURE_FLAGS.SHOW_SEE_IT_IN_ACTION;

  if (!showSection) return null;

  return <HomeLiveProofSection creators={FALLBACK_AVATARS.slice(0, 3)} />;
}
