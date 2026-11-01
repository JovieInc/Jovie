import {
  ADMIN_NAV_REGISTRY,
  type AdminWorkspaceId,
} from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import {
  githubPullsUrl,
  OVIE_CONFIGURED_PUBLIC_ORIGINS,
} from '@/lib/hud/ovie-launchers';
import type { KeyboardShortcut } from '@/lib/keyboard-shortcuts';

/**
 * Keyboard-first operator navigation (Linear-style "G then X"). Keys belong to
 * the five daily destinations only; Business and Tools are reached from the
 * command palette. One owner: labels and hrefs come from ADMIN_NAV_REGISTRY.
 */
export const OPERATOR_SEQUENCE_KEYS: Partial<Record<AdminWorkspaceId, string>> =
  {
    overview: 'h',
    inbox: 'i',
    shipping: 's',
    operations: 'f',
    costs: 'c',
  };

export const OPERATOR_SEQUENCE_SHORTCUTS: readonly KeyboardShortcut[] =
  ADMIN_NAV_REGISTRY.flatMap(item => {
    const key = OPERATOR_SEQUENCE_KEYS[item.id];
    if (!key) return [];
    return [
      {
        id: `ov-nav-${item.id}`,
        label: `Go to ${item.label.toLowerCase()}`,
        keys: `G then ${key.toUpperCase()}`,
        category: 'navigation' as const,
        href: item.href,
        isSequential: true,
        firstKey: 'g',
        secondKey: key,
        decision: {
          status: 'required' as const,
          binding: 'useSequentialShortcuts',
        },
      },
    ];
  });

export interface OperatorCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly group: 'go' | 'open';
  /** Opens outside Ovie (new tab). */
  readonly external: boolean;
  readonly shortcutLabel?: string;
}

const OPEN_TARGETS: readonly (readonly [
  label: string,
  description: string,
  href: string | null,
])[] = [
  [
    'Open Linear',
    'Jovie issues and triage',
    OVIE_CONFIGURED_PUBLIC_ORIGINS.linear,
  ],
  ['Open GitHub PRs', 'Open pull requests', githubPullsUrl()],
  [
    'Open Vercel',
    'Deployments and logs',
    OVIE_CONFIGURED_PUBLIC_ORIGINS.vercelDashboard,
  ],
  ['Open Status', 'status.jov.ie', OVIE_CONFIGURED_PUBLIC_ORIGINS.status],
];

/** Palette rows for Ovie: every destination, then the web tools Ops launchers used to hold. */
export function buildOperatorCommands(): readonly OperatorCommand[] {
  const go = ADMIN_NAV_REGISTRY.map((item): OperatorCommand => {
    const key = OPERATOR_SEQUENCE_KEYS[item.id];
    return {
      id: `ovie-go:${item.href}`,
      label: item.label,
      description: item.description,
      href: item.href,
      group: 'go',
      external: false,
      ...(key ? { shortcutLabel: `G then ${key.toUpperCase()}` } : {}),
    };
  });
  const open = OPEN_TARGETS.flatMap(([label, description, href]) =>
    href
      ? [
          {
            id: `ovie-open:${href}`,
            label,
            description,
            href,
            group: 'open',
            external: true,
          } satisfies OperatorCommand,
        ]
      : []
  );
  return [...go, ...open];
}

/** Does this pathname belong to Ovie (so the palette shows operator commands)? */
export function isOvieSurface(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return [APP_ROUTES.OV, APP_ROUTES.LEGACY_ADMIN].some(
    root => pathname === root || pathname.startsWith(`${root}/`)
  );
}
