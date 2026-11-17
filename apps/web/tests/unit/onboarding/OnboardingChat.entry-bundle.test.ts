import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /start entry-bundle guard (JOV-9611 + JOV-12023). The /start empty state
 * paints only the intro heading and the composer. Conversation renderers
 * (markdown message bodies, tool UI, proposal cards) must stay out of the
 * entry bundle: when they were static imports, ~70 async chunks (1.25 MB)
 * evaluated before Chrome's first frame on CI runners, and Lighthouse's
 * simulated mobile LCP charged all of them to the h1 (8.4-8.8 s against a
 * 4 s budget). Their warming lives in onboardingConversationWarm and must
 * ride user intent — never the idle window, whose in-window chunk eval
 * owned ~170 ms of /start TBT on the JOV-12023 merge-group gate.
 */
const onboardingDir = path.resolve(
  __dirname,
  '../../../components/features/onboarding'
);
const chatSource = readFileSync(
  path.join(onboardingDir, 'OnboardingChat.tsx'),
  'utf8'
);
const warmSource = readFileSync(
  path.join(onboardingDir, 'onboardingConversationWarm.ts'),
  'utf8'
);
const source = `${chatSource}\n${warmSource}`;

const staticImports = source
  .split('\n')
  .join(' ')
  .match(/import\s+(?!type\b)[^;]*?from\s+'[^']+'/g);

function staticImportOf(specifier: string): string | undefined {
  return staticImports?.find(statement =>
    statement.endsWith(`from '${specifier}'`)
  );
}

describe('OnboardingChat entry bundle', () => {
  it('does not statically import the chat message renderer', () => {
    const barrel = staticImportOf('@/components/jovie/components');
    expect(barrel).toBeDefined();
    expect(barrel).not.toMatch(/\bChatMessage\b/);
    expect(
      staticImportOf('@/components/jovie/components/ChatMessage')
    ).toBeUndefined();
  });

  it('does not statically import tool UI or proposal cards', () => {
    expect(staticImportOf('@/components/jovie/tool-ui')).toBeUndefined();
    expect(staticImportOf('./ChatProposeCheckoutCard')).toBeUndefined();
    expect(staticImportOf('./ChatProposeNextStepCard')).toBeUndefined();
  });

  it('loads the profile preview rail only when there is a preview (perf)', () => {
    expect(staticImportOf('./OnboardingProfileRail')).toBeUndefined();
    expect(staticImportOf('./OnboardingProfileRailLazy')).toMatch(
      /\bOnboardingProfileRail\b/
    );
  });

  it('loads conversation renderers on demand and warms them on user intent', () => {
    // Inline import() keeps Next preload metadata. The transcript owns one
    // boundary; tool cards retain local fallbacks instead of suspending the route.
    const dynamicCalls =
      chatSource.match(/dynamic\(\s*\(\)\s*=>\s*import\(/g) ?? [];
    expect(dynamicCalls).toHaveLength(4);
    expect(chatSource.match(/\{\s*loading:/g) ?? []).toHaveLength(3);
    expect(chatSource).toMatch(/<Suspense fallback=\{null\}>/);
    // The loaders resolve to the same chunks from the warm module.
    expect(warmSource).toMatch(/loadChatMessage\(\)/);
    expect(chatSource).toMatch(/scheduleOnboardingConversationPreload\(/);
    // JOV-12023: an idle warm evaluates the conversation chunks inside
    // Lighthouse's measured window; the warm must ride user intent only.
    expect(source).not.toMatch(/requestIdleCallback/);
    expect(warmSource).toMatch(
      /addEventListener\(\s*event,\s*warm,\s*\{\s*capture: true,\s*once: true,\s*passive: true,\s*\}/
    );
    // The submit warm covers the starter auto-send, which has no user
    // gesture to trip the intent listeners.
    expect(chatSource).toMatch(/preloadOnboardingConversationChunks\(\)/);
    // The warm must never fire inside the vitest runner: its import graph
    // resolves after file teardown and fails the shard with unhandled
    // EnvironmentTeardownError rejections (run 42697661623, shard 3/14).
    expect(warmSource).toMatch(
      /if \(process\.env\.NODE_ENV === 'test'\) return;/
    );
  });
});
