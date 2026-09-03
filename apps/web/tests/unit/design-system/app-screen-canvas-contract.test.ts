import { describe, expect, it } from 'vitest';
import {
  APP_SCREEN_CANVAS_DEFAULT_CONTRACT,
  APP_SCREEN_CANVAS_EXCEPTIONS,
  APP_SCREEN_CANVAS_MANIFEST_SCHEMA,
  APP_SCREEN_NESTED_SURFACE_ROLES,
  APP_SCREEN_REGISTRY,
  type AppScreenCanvasContract,
  appScreenCanvasContract,
  validateAppScreenSystem,
} from '@/data/appScreens';

const INBOX_SOURCE = 'apps/web/app/app/(shell)/page.tsx';

describe('app screen canvas contract', () => {
  it('pins one shell-owned default and the closed nested-role vocabulary', () => {
    expect(APP_SCREEN_CANVAS_MANIFEST_SCHEMA).toBe(
      'jovie.app-screens.canvas/v1'
    );
    expect(APP_SCREEN_CANVAS_DEFAULT_CONTRACT).toEqual({
      canvasOwner: 'shell',
      nestedSurfaceRoles: [],
      nestedCanvasAllowances: [],
    });
    expect([...APP_SCREEN_NESTED_SURFACE_ROLES]).toEqual([
      'navigation',
      'context',
      'module',
      'card',
    ]);
    for (const screen of APP_SCREEN_REGISTRY) {
      expect(screen.canvas, screen.route).toEqual(
        appScreenCanvasContract(screen.source)
      );
    }
  });

  it('source-binds the existing Inbox canvas until its repair removes both', () => {
    expect(APP_SCREEN_CANVAS_EXCEPTIONS[INBOX_SOURCE]).toEqual({
      canvasOwner: 'screen',
      nestedSurfaceRoles: [],
      nestedCanvasAllowances: [
        {
          source:
            'apps/web/components/features/opportunity-inbox/OpportunityInboxPageClient.tsx',
          component: 'PageShell',
          enclosingFunction: 'OpportunityInboxPageClient',
        },
      ],
      note: 'Legacy/demo holdover nested canvas — declared pending founder decision',
    });
    expect(
      APP_SCREEN_REGISTRY.find(screen => screen.source === INBOX_SOURCE)?.canvas
    ).toEqual(APP_SCREEN_CANVAS_EXCEPTIONS[INBOX_SOURCE]);
  });

  it('deliberately rejects malformed runtime ownership records', () => {
    const canvasExceptions = {
      [INBOX_SOURCE]: {
        canvasOwner: 'route',
        nestedSurfaceRoles: ['module', 'module', 'violet-focus'],
        nestedCanvasAllowances: [
          {
            source: INBOX_SOURCE,
            component: 'Card',
            enclosingFunction: 'InboxPage',
          },
        ],
      } as unknown as AppScreenCanvasContract,
    };

    expect(
      validateAppScreenSystem({ canvasExceptions }).map(issue => issue.code)
    ).toEqual(
      expect.arrayContaining([
        'canvas-owner-invalid',
        'canvas-nested-role-invalid',
        'canvas-nested-role-duplicate',
        'canvas-nested-component-invalid',
      ])
    );
  });
});
