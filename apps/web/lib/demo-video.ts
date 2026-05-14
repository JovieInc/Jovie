export const DEMO_VIDEO_PUBLIC_PATH = '/demo/jovie-demo.mp4';
export const DEMO_CAPTIONS_PUBLIC_PATH = '/demo/jovie-demo.vtt';
export const DEMO_POSTER_PUBLIC_PATH = '/demo/jovie-demo-poster.jpg';

export function getDemoVideoUrl() {
  return process.env.DEMO_VIDEO_URL?.trim() || DEMO_VIDEO_PUBLIC_PATH;
}

export function getDemoVideoPosterUrl() {
  return process.env.DEMO_VIDEO_POSTER_URL?.trim() || DEMO_POSTER_PUBLIC_PATH;
}

export function getDemoVideoDownloadHref(videoUrl: string) {
  return videoUrl.startsWith('/') ? videoUrl : '/api/demo/download';
}
