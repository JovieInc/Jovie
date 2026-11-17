import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { isCanonicalUuid } from '@/lib/auth/profile-access';
import { getSessionContext } from '@/lib/auth/session';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import { selectedPromotionWork } from '@/lib/db/creator-documents/catalog-promotion';
import { buildSmartLinkUrl } from '@/lib/discography/utils';
import { PrivatePromotionForm } from './PrivatePromotionForm';

export default async function CatalogPromotionPage({
  params,
}: {
  readonly params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  if (!isCanonicalUuid(releaseId)) notFound();
  const { user, profile } = await getSessionContext({ requireProfile: true });
  if (!user || !profile) notFound();
  await requireCreatorDocumentAccess({ userId: user.id, profileId: profile.id, ownerOnly: true });
  const [release] = await selectedPromotionWork(profile.id, releaseId);
  const handle = profile.usernameNormalized || profile.username;
  if (!release?.slug || !handle) notFound();
  return (
    <PrivatePromotionForm
      profileId={profile.id}
      releaseId={release.id}
      title={release.title}
      destination={buildSmartLinkUrl(BASE_URL, handle, release.slug)}
    />
  );
}
