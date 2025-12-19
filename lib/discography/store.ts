import { DEFAULT_RELEASE_TEMPLATES, PRIMARY_PROVIDER_KEYS } from './config';
import type {
  ProviderKey,
  ProviderLink,
  ReleaseRecord,
  ReleaseTemplate,
  ReleaseViewModel,
} from './types';
import { buildReleaseSlug, buildSmartLinkPath } from './utils';

const discographyStore = new Map<string, ReleaseRecord[]>();

function cloneRelease(release: ReleaseRecord): ReleaseRecord {
  return structuredClone(release);
}

function getTemplate(releaseId: string): ReleaseTemplate | undefined {
  return DEFAULT_RELEASE_TEMPLATES.find(template => template.id === releaseId);
}

function hydrateRelease(
  profileId: string,
  template: ReleaseTemplate
): ReleaseRecord {
  const slug = buildReleaseSlug(profileId, template.id);
  const providers: ProviderLink[] = Object.entries(template.providers).map(
    ([key, url]) => ({
      key: key as ProviderKey,
      url: url as string,
      source: 'ingested',
      updatedAt: new Date().toISOString(),
    })
  );

  return {
    id: template.id,
    slug,
    title: template.title,
    releaseDate: template.releaseDate,
    artworkUrl: template.artworkUrl,
    providers,
  };
}

function ensureProfileDiscography(profileId: string): ReleaseRecord[] {
  const existing = discographyStore.get(profileId);
  if (existing?.length) return existing;

  const seeded = DEFAULT_RELEASE_TEMPLATES.map(template =>
    hydrateRelease(profileId, template)
  );

  discographyStore.set(profileId, seeded);
  return seeded;
}

export function getReleasesForProfile(profileId: string): ReleaseRecord[] {
  return ensureProfileDiscography(profileId).map(cloneRelease);
}

export function resolveReleaseBySlug(slug: string): {
  profileId: string;
  release: ReleaseRecord;
} | null {
  const separator = '--';
  const lastSeparatorIndex = slug.lastIndexOf(separator);
  if (lastSeparatorIndex === -1) return null;

  const releaseId = slug.slice(0, lastSeparatorIndex);
  const profileId = slug.slice(lastSeparatorIndex + separator.length);

  const releases = ensureProfileDiscography(profileId);
  const match = releases.find(entry => entry.id === releaseId);
  if (!match) return null;

  return { profileId, release: cloneRelease(match) };
}

export function updateProviderLink(
  profileId: string,
  releaseId: string,
  provider: ProviderKey,
  url: string
): ReleaseRecord {
  const releases = ensureProfileDiscography(profileId);
  const release = releases.find(entry => entry.id === releaseId);

  if (!release) {
    throw new Error('Release not found');
  }

  const trimmedUrl = url.trim();
  const existingProvider = release.providers.find(
    link => link.key === provider
  );
  const now = new Date().toISOString();

  if (trimmedUrl.length === 0) {
    const template = getTemplate(releaseId);
    const templateUrl = template?.providers?.[provider];

    if (templateUrl) {
      if (existingProvider) {
        existingProvider.url = templateUrl;
        existingProvider.source = 'ingested';
        existingProvider.updatedAt = now;
      } else {
        release.providers.push({
          key: provider,
          url: templateUrl,
          source: 'ingested',
          updatedAt: now,
        });
      }
    } else if (existingProvider) {
      release.providers = release.providers.filter(
        link => link.key !== provider
      );
    }

    return cloneRelease(release);
  }

  if (existingProvider) {
    existingProvider.url = trimmedUrl;
    existingProvider.source = 'manual';
    existingProvider.updatedAt = now;
  } else {
    release.providers.push({
      key: provider,
      url: trimmedUrl,
      source: 'manual',
      updatedAt: now,
    });
  }

  return cloneRelease(release);
}

export function mapReleaseToViewModel(
  release: ReleaseRecord,
  providerLabels: Record<ProviderKey, string>,
  profileId: string
): ReleaseViewModel {
  return {
    profileId,
    ...release,
    smartLinkPath: buildSmartLinkPath(release.slug),
    providers: Object.entries(providerLabels).map(([key, label]) => {
      const providerKey = key as ProviderKey;
      const match = release.providers.find(link => link.key === providerKey);
      const url = match?.url ?? '';
      const source = match?.source ?? 'ingested';
      const updatedAt = match?.updatedAt ?? new Date().toISOString();

      return {
        key: providerKey,
        label,
        url,
        source,
        updatedAt,
        path: url ? buildSmartLinkPath(release.slug, providerKey) : '',
        isPrimary: PRIMARY_PROVIDER_KEYS.includes(providerKey),
      };
    }),
  };
}
