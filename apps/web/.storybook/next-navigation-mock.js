// Mock Next.js navigation for Storybook
export const useRouter = () => ({
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
});

export const usePathname = () => '/test';
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export function redirect() {}
export function permanentRedirect() {}
export function notFound() {
  throw new Error('NEXT_NOT_FOUND');
}
