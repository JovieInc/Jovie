import { notFound } from 'next/navigation';
import { isCanonicalUuid } from '@/lib/auth/profile-access';
import { getSessionContext } from '@/lib/auth/session';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import { promotionContext } from '@/lib/creator-documents/promotion-copy';
import {
  selectedPromotionWork,
  selectedReleaseDestinations,
} from '@/lib/db/creator-documents/catalog-promotion';
import { PrivatePromotionForm } from './PrivatePromotionForm';

export async function CatalogPromotionComposer({
  releaseId,
}: {
  readonly releaseId: string;
}) {
  if (!isCanonicalUuid(releaseId)) notFound();
  const { user, profile } = await getSessionContext({ requireProfile: true });
  if (!user || !profile) notFound();
  await requireCreatorDocumentAccess({
    userId: user.id,
    profileId: profile.id,
    ownerOnly: true,
  });
  const [release] = await selectedPromotionWork(profile.id, releaseId);
  if (!release) notFound();
  const links = await selectedReleaseDestinations(release.id);
  return (
    <PrivatePromotionForm
      profileId={profile.id}
      releaseId={release.id}
      title={release.title}
      context={promotionContext(release, links, new Date())}
    />
  );
}
