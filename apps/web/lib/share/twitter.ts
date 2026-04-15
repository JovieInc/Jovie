import { buildPreparedShareText } from './copy';
import type { ShareSurfaceType } from './types';

export type ShareContentType = ShareSurfaceType;

export function getTwitterShareUrl(
  contentType: ShareContentType,
  title: string,
  url: string,
  username?: string
): string {
  const text = buildPreparedShareText({
    surfaceType: contentType,
    title,
    artistName: username,
  });
  const params = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}
