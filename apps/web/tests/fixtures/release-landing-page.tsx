import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Type helpers for mock props
// ---------------------------------------------------------------------------
type LinkProps = {
  readonly href: string;
  readonly children: React.ReactNode;
  readonly [key: string]: unknown;
};

type ChildrenProps = { readonly children: React.ReactNode };

// ---------------------------------------------------------------------------
// Mock ALL heavy dependencies to avoid vitest worker OOM
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  AlertTriangle: (p: Record<string, unknown>) => (
    <span data-testid='icon-alerttriangle' {...p} />
  ),
  CheckCircle2: (p: Record<string, unknown>) => (
    <span data-testid='icon-checkcircle2' {...p} />
  ),
  Info: (p: Record<string, unknown>) => <span data-testid='icon-info' {...p} />,
  Share2: (p: Record<string, unknown>) => (
    <span data-testid='icon-share2' {...p} />
  ),
  Sparkles: (p: Record<string, unknown>) => (
    <span data-testid='icon-sparkles' {...p} />
  ),
  Download: (p: Record<string, unknown>) => (
    <span data-testid='icon-download' {...p} />
  ),
  Users: (p: Record<string, unknown>) => (
    <span data-testid='icon-users' {...p} />
  ),
  X: (p: Record<string, unknown>) => <span data-testid='icon-x' {...p} />,
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: LinkProps) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/[username]/[slug]/_lib/data', () => ({}));

vi.mock('@/components/atoms/DspLogo', () => ({
  DSP_LOGO_CONFIG: {} as Record<string, { name: string; iconPath: string }>,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name, ...rest }: { name: string } & Record<string, unknown>) => (
    <span data-testid={`icon-${name}`} {...rest} />
  ),
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: { SIGNUP: '/signup' },
}));

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    children,
    open,
  }: ChildrenProps & { open: boolean }) =>
    open ? <div data-testid='profile-drawer'>{children}</div> : null,
}));

vi.mock('@/features/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({ children }: ChildrenProps) => (
    <div data-testid='artwork-context-menu'>{children}</div>
  ),
  buildArtworkSizes: () => ({}),
}));

vi.mock('@/features/release/ReleaseCreditsDrawer', () => ({
  ReleaseCreditsDrawer: ({
    open,
    credits,
  }: {
    open: boolean;
    credits?: Array<{
      label: string;
      entries: Array<{ name: string }>;
    }>;
  }) => (
    <div data-testid='credits-drawer'>
      {open
        ? credits?.map(group => (
            <section key={group.label}>
              <h2>{group.label}</h2>
              {group.entries.map(entry => (
                <span key={entry.name}>{entry.name}</span>
              ))}
            </section>
          ))
        : null}
    </div>
  ),
}));

vi.mock('@/features/release/SmartLinkAudioPreview', () => ({
  SmartLinkAudioPreview: () => <div data-testid='audio-preview' />,
}));

vi.mock('@/features/release/SmartLinkPagePrimitives', () => ({
  SmartLinkPoweredByFooter: ({ reportTarget }: { reportTarget?: string }) => (
    <div data-testid='powered-by-footer' data-report-target={reportTarget} />
  ),
}));

vi.mock('@/features/release/SmartLinkProviderButton', () => ({
  SmartLinkProviderButton: ({
    href,
    label,
    primary,
  }: {
    href: string;
    label: string;
    onClick?: () => void;
    primary?: boolean;
  }) => (
    <div
      data-testid='provider-button'
      data-href={href}
      data-label={label}
      data-primary={primary ? 'true' : 'false'}
    >
      {label}
    </div>
  ),
}));

const shareSpy = vi.fn();

vi.mock('@/features/release/SmartLinkShell', () => ({
  SMART_LINK_HERO_TITLE_CLASS:
    'text-2xl font-semibold leading-[1.08] tracking-tight text-(--color-text-tooltip) [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]',
  SmartLinkShell: ({
    children,
    heroMeta,
  }: ChildrenProps & { heroMeta?: React.ReactNode }) => (
    <div data-testid='smart-link-shell'>
      {heroMeta}
      {children}
    </div>
  ),
  useSmartLinkShare: () => shareSpy,
  SMART_LINK_MENU_ICON_CLASS: 'menu-icon',
  SMART_LINK_MENU_ITEM_CLASS: 'menu-item',
}));

vi.mock('@/lib/discography/types', () => ({}));

vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: vi.fn(),
}));

vi.mock('@/lib/utm', () => ({
  // Minimal implementation: appends non-empty utm_* params as query string.
  appendUTMParamsToUrl: (url: string, params: Record<string, string>) => {
    const utmKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
    ];
    const entries = utmKeys.filter(k => params[k]?.trim());
    if (entries.length === 0) return url;
    const qs = entries.map(k => `${k}=${params[k].trim()}`).join('&');
    return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
  },
  extractUTMParams: () => ({}),
  SMART_LINK_DEFAULT_UTM_PARAMS: { utm_source: 'jovie' },
  // No visit UTMs in jsdom, so the shared rule falls back to the defaults.
  resolveSmartLinkOutboundUtmParams: (
    _searchParams: URLSearchParams,
    defaults: Record<string, string> = { utm_source: 'jovie' }
  ) => ({ ...defaults }),
}));
