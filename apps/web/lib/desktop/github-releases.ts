import 'server-only';
import { z } from 'zod';

const GITHUB_OWNER = 'JovieInc';
const GITHUB_REPO = 'Jovie';
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export const DESKTOP_RELEASES_HTML_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

export interface DesktopReleaseAsset {
  readonly name: string;
  readonly url: string;
  readonly sizeBytes: number;
}

export interface DesktopRelease {
  readonly version: string;
  readonly publishedAt: string;
  readonly htmlUrl: string;
  readonly mac: DesktopReleaseAsset | null;
}

const githubAssetSchema = z.object({
  name: z.string().min(1),
  browser_download_url: z.url({
    protocol: /^https$/,
    hostname: /^github\.com$/,
  }),
  size: z.number().int().positive(),
});
const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  published_at: z.string().min(1),
  html_url: z.url({ protocol: /^https$/ }),
  // Ignore unrelated malformed assets; only a validated universal DMG can
  // confirm Mac availability or become a download redirect.
  assets: z.array(z.unknown()),
});

const isUniversalMacDmg = (asset: z.infer<typeof githubAssetSchema>) =>
  /\.dmg$/i.test(asset.name) && /universal/i.test(asset.name);

export async function fetchLatestDesktopRelease(): Promise<DesktopRelease | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'jovie-web',
      },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const parsed = githubReleaseSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    const data = parsed.data;
    const macAsset = data.assets
      .map(asset => githubAssetSchema.safeParse(asset))
      .find(asset => asset.success && isUniversalMacDmg(asset.data));
    return {
      version: data.tag_name.replace(/^v/, ''),
      publishedAt: data.published_at,
      htmlUrl: data.html_url,
      mac: macAsset?.success
        ? {
            name: macAsset.data.name,
            url: macAsset.data.browser_download_url,
            sizeBytes: macAsset.data.size,
          }
        : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
