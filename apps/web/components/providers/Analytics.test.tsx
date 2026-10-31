import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameRef = vi.hoisted(() => ({ current: '/index' as string | null }));
const pageMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ usePathname: () => pathnameRef.current }));
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));
vi.mock('@/lib/analytics', () => ({ page: pageMock }));

import { Analytics } from './Analytics';

describe('Analytics', () => {
  beforeEach(() => pageMock.mockClear());

  it('reports the prerendered homepage ("/index") as "/"', () => {
    pathnameRef.current = '/index';
    render(<Analytics />);
    expect(pageMock).toHaveBeenCalledWith('/', { url: '/' });
  });

  it('reports other pathnames unchanged', () => {
    pathnameRef.current = '/pricing';
    render(<Analytics />);
    expect(pageMock).toHaveBeenCalledWith('/pricing', { url: '/pricing' });
  });
});
