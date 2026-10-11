/**
 * Mobile chat surface certification (JOV-7203).
 *
 * Deterministic, model-free certification of the mobile chat experience on the
 * artist-profile/chat surfaces. It encodes the founder-rejected mobile chat as
 * a named contract so the quality ratchet can:
 *   1. keep a known-bad reference (KNOWN_BAD_MOBILE_CHAT_FIXTURE),
 *   2. say exactly why that experience is unacceptable (violation ids),
 *   3. verify the approved implementation satisfies the contract,
 *   4. reject representative reintroductions of the failure class.
 *
 * Each rule maps to one concrete mobile failure mode:
 *   - viewport-anchor: the chat shell must anchor to a known viewport height
 *     (`scroll='panel'` + `absolute inset-0`), not a fixed `100vh`/`h-screen`
 *     box — a fixed height lands the composer under the mobile URL bar or the
 *     on-screen keyboard.
 *   - composer-dock-pinned: the composer must be absolutely docked to the
 *     bottom of the chat viewport, never flowed after the transcript.
 *   - composer-safe-area: the dock must pad `env(safe-area-inset-bottom)` so
 *     the composer clears the iOS home indicator.
 *   - thread-scroll-clearance: the transcript must reserve bottom scroll
 *     padding so the last message scrolls clear of the floating composer.
 *   - keyboard-viewport-listener: the chat must observe `window.visualViewport`
 *     resizes so an opening keyboard re-anchors the scroll position instead of
 *     covering the composer.
 *   - composer-dock-mounted: the view must mount the shared composer dock
 *     class/testid — a detached composer implementation drifts from the dock
 *     contract above.
 */

export type MobileChatSurfaceId =
  | 'workspaceSurface'
  | 'composerDockStyles'
  | 'chatTokens'
  | 'chatLayout'
  | 'chatView';

/** Repo-relative (apps/web) sources the certification evaluates. */
export const MOBILE_CHAT_SURFACE_FILES: Record<MobileChatSurfaceId, string> = {
  workspaceSurface: 'components/jovie/ChatWorkspaceSurface.tsx',
  composerDockStyles: 'styles/system-b-app.css',
  chatTokens: 'styles/design-system.css',
  chatLayout: 'components/jovie/chat-layout.ts',
  chatView: 'components/jovie/JovieChat.tsx',
};

export interface MobileChatViolation {
  readonly rule: string;
  readonly surface: MobileChatSurfaceId;
  readonly detail: string;
}

interface MobileChatRule {
  readonly id: string;
  readonly surface: MobileChatSurfaceId;
  readonly detail: string;
  readonly pass: (source: string) => boolean;
}

const FIXED_VIEWPORT_HEIGHT =
  /(?:^|[\s"'])h-screen|min-h-screen|(?:min-)?height:\s*100vh\b/;

export const MOBILE_CHAT_RULES: readonly MobileChatRule[] = [
  {
    id: 'viewport-anchor',
    surface: 'workspaceSurface',
    detail:
      'chat workspace must anchor to the shell viewport via scroll=panel and absolute inset-0, not a fixed vh height',
    pass: source =>
      source.includes("scroll='panel'") &&
      source.includes('absolute inset-0') &&
      !FIXED_VIEWPORT_HEIGHT.test(source),
  },
  {
    id: 'composer-dock-pinned',
    surface: 'composerDockStyles',
    detail:
      'composer dock must be absolutely positioned at the bottom of the chat viewport',
    pass: source => {
      const block = source.match(
        /\.system-b-chat-composer-dock\b[^}]*\{([^}]*)\}/
      );
      return (
        Boolean(block) &&
        /position:\s*absolute/.test(block?.[1] ?? '') &&
        /bottom:\s*0/.test(block?.[1] ?? '')
      );
    },
  },
  {
    id: 'composer-safe-area',
    surface: 'composerDockStyles',
    detail:
      'composer dock must pad env(safe-area-inset-bottom) so it clears the iOS home indicator',
    pass: source => {
      const block = source.match(
        /\.system-b-chat-composer-dock\b[^}]*\{([^}]*)\}/
      );
      return /env\(safe-area-inset-bottom\)/.test(block?.[1] ?? '');
    },
  },
  {
    id: 'thread-scroll-clearance',
    surface: 'chatTokens',
    detail:
      'transcript must define --system-b-chat-composer-thread-scroll-padding so the last message scrolls clear of the docked composer',
    pass: source =>
      /--system-b-chat-composer-thread-scroll-padding:\s*[^;]+;/.test(source),
  },
  {
    id: 'thread-scroll-clearance-applied',
    surface: 'chatLayout',
    detail:
      'chat layout must export the composer thread scroll-padding class and apply it to the transcript',
    pass: source =>
      source.includes('CHAT_COMPOSER_THREAD_SCROLL_PADDING_CLASSNAME') &&
      source.includes('system-b-chat-composer-thread-scroll-padding'),
  },
  {
    id: 'keyboard-viewport-listener',
    surface: 'chatView',
    detail:
      'chat must subscribe to window.visualViewport resize so the on-screen keyboard re-anchors the transcript instead of covering the composer',
    pass: source =>
      /window\.visualViewport\?*\.addEventListener\('resize'/.test(source) &&
      /window\.visualViewport\?*\.removeEventListener\('resize'/.test(source),
  },
  {
    id: 'composer-dock-mounted',
    surface: 'chatView',
    detail:
      'chat view must mount the shared composer dock (CHAT_COMPOSER_DOCK_CLASSNAME + chat-composer-dock testid) and never a fixed-viewport-height shell',
    pass: source =>
      source.includes('CHAT_COMPOSER_DOCK_CLASSNAME') &&
      source.includes("data-testid='chat-composer-dock'") &&
      !FIXED_VIEWPORT_HEIGHT.test(source),
  },
];

export interface MobileChatCertificationResult {
  readonly ok: boolean;
  readonly violations: MobileChatViolation[];
}

/** Certify a set of surface sources against the mobile chat contract. */
export function certifyMobileChatSurface(
  sources: Record<MobileChatSurfaceId, string>
): MobileChatCertificationResult {
  const violations: MobileChatViolation[] = [];
  for (const rule of MOBILE_CHAT_RULES) {
    const source = sources[rule.surface];
    if (typeof source !== 'string' || !rule.pass(source)) {
      violations.push({
        rule: rule.id,
        surface: rule.surface,
        detail: rule.detail,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Preserved reference of the founder-rejected mobile chat experience.
 *
 * Representative of the failure class: a fixed `min-h-screen` shell that
 * breaks under the mobile URL bar and keyboard, a composer flowed after the
 * transcript (docked nowhere), no safe-area padding (composer under the home
 * indicator), no transcript scroll clearance (last message hidden behind the
 * composer), and no visualViewport keyboard handling.
 *
 * Certification MUST reject this fixture. It exists so the detector's
 * rejection is exercised, not just asserted.
 */
export const KNOWN_BAD_MOBILE_CHAT_FIXTURE: Record<
  MobileChatSurfaceId,
  string
> = {
  workspaceSurface: `
export function ChatWorkspaceSurface({ children }) {
  return <div className='min-h-screen flex flex-col'>{children}</div>;
}
`,
  composerDockStyles: `
.system-b-chat-composer-dock {
  padding: 8px;
  background: white;
}
`,
  chatTokens: `
:root {
  --system-b-chat-composer-max-width: 45rem;
}
`,
  chatLayout: `
export const CHAT_CONTENT_SHELL_CLASSNAME = 'system-b-chat-content-shell';
`,
  chatView: `
export function JovieChat() {
  return (
    <div className='flex h-screen flex-col'>
      <div className='flex-1 overflow-y-auto'>{messages}</div>
      <div className='border-t p-2'>{composerSurface}</div>
    </div>
  );
}
`,
};
