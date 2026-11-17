// Mock Next.js navigation for Storybook.
// Next returns referentially stable router/search-params instances. Stories
// must too: components list `router` in effect deps, and a fresh object per
// render re-ran those effects forever (Maximum update depth in the
// Storybook a11y lane, which then hung or lost the browser).
import { usePathname as storybookUsePathname } from '@storybook/nextjs-vite/navigation.mock';

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
// Let the installed framework's router context own per-story pathnames.
// A fixed /test path suppresses app feedback even in app-shell error stories.
export const usePathname = storybookUsePathname;
export const useSearchParams = () => searchParams;
export const useParams = () => params;
export function redirect() {}
export function permanentRedirect() {}
export function notFound() {
  throw new Error('NEXT_NOT_FOUND');
}
