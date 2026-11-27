export const DEMO_VIDEO_PUBLIC_PATH = '/demo/jovie-demo.mp4';
export const DEMO_CAPTIONS_PUBLIC_PATH = '/demo/jovie-demo.vtt';
export const DEMO_POSTER_PUBLIC_PATH = '/demo/jovie-demo-poster.jpg';

// Shrink-only ratchet for the tracked public demo blob. The 2026-11-21
// merge-queue ejection reclaim re-encoded 4037667 → ~2.1 MiB (1280p CRF28);
// do not grow this ceiling without a matching headroom plan
// (docs/ci/repository-health.md).
export const DEMO_VIDEO_MAX_BYTES = Math.floor(2.5 * 1024 * 1024);

export function getDemoVideoUrl() {
  return process.env.DEMO_VIDEO_URL?.trim() || DEMO_VIDEO_PUBLIC_PATH;
}

export function getDemoVideoPosterUrl() {
  return process.env.DEMO_VIDEO_POSTER_URL?.trim() || DEMO_POSTER_PUBLIC_PATH;
}

export function getDemoVideoDownloadHref(videoUrl: string) {
  return videoUrl.startsWith('/') ? videoUrl : '/api/demo/download';
}
