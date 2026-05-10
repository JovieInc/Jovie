import 'server-only';

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

interface GithubAsset {
  readonly name: string;
  readonly browser_download_url: string;
  readonly size: number;
}

interface GithubRelease {
  readonly tag_name: string;
  readonly published_at: string;
  readonly html_url: string;
  readonly assets: readonly GithubAsset[];
}

const isUniversalMacDmg = (asset: GithubAsset) =>
  /\.dmg$/i.test(asset.name) && /universal/i.test(asset.name);

export async function fetchLatestDesktopRelease(): Promise<DesktopRelease | null> {
  try {
    const res = await fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'jovie-web',
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GithubRelease;
    const macAsset = data.assets.find(isUniversalMacDmg);
    return {
      version: data.tag_name.replace(/^v/, ''),
      publishedAt: data.published_at,
      htmlUrl: data.html_url,
      mac: macAsset
        ? {
            name: macAsset.name,
            url: macAsset.browser_download_url,
            sizeBytes: macAsset.size,
          }
        : null,
    };
  } catch {
    return null;
  }
}
