// Mock Next.js navigation for Storybook.
// Next returns referentially stable router/search-params instances. Stories
// must too: components list `router` in effect deps, and a fresh object per
// render re-ran those effects forever (Maximum update depth in the
// Storybook a11y lane, which then hung or lost the browser).
const router = {
  push: () => Promise.resolve(true),
  replace: () => Promise.resolve(true),
  prefetch: () => Promise.resolve(),
  back: () => {},
  forward: () => {},
  refresh: () => {},
  pathname: '/test',
  route: '/test',
  query: {},
  asPath: '/test',
  basePath: '',
  isLocaleDomain: true,
  isReady: true,
  isFallback: false,
  isPreview: false,
  events: {
    on: () => {},
    off: () => {},
    emit: () => {},
  },
};
const searchParams = new URLSearchParams();
const params = {};

export const useRouter = () => router;
export const usePathname = () => '/test';
export const useSearchParams = () => searchParams;
export const useParams = () => params;
export function redirect() {}
export function permanentRedirect() {}
export function notFound() {
  throw new Error('NEXT_NOT_FOUND');
}
