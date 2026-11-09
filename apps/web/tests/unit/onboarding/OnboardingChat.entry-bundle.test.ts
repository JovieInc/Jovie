import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * /start LCP guard (JOV-9611). The /start empty state paints only the intro
 * heading and the composer. Conversation renderers (markdown message bodies,
 * tool UI, proposal cards) must stay out of the entry bundle: when they were
 * static imports, ~70 async chunks (1.25 MB) evaluated before Chrome's first
 * frame on CI runners, and Lighthouse's simulated mobile LCP charged all of
 * them to the h1 (8.4-8.8 s against a 4 s budget).
 */
const source = readFileSync(
  path.resolve(
    __dirname,
    '../../../components/features/onboarding/OnboardingChat.tsx'
  ),
  'utf8'
);

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
      source.match(/dynamic\(\s*\(\)\s*=>\s*import\(/g) ?? [];
    expect(dynamicCalls).toHaveLength(4);
    expect(source.match(/\{\s*loading:/g) ?? []).toHaveLength(3);
    expect(source).toMatch(/<Suspense fallback=\{null\}>/);
    expect(source).toMatch(/loadChatMessage\(\)/);
    expect(source).toMatch(/scheduleOnboardingConversationPreload\(/);
    // JOV-12023: an idle warm evaluates the conversation chunks inside
    // Lighthouse's measured window and owned ~170 ms of /start TBT (run
    // 42689319887). The warm must ride user intent only.
    expect(source).not.toMatch(/requestIdleCallback/);
    // Three call sites: the warm callback, the first submit, and the function
    // definition — the submit warm covers the starter auto-send, which has no
    // user gesture to trip the intent listeners.
    expect(
      source.match(/preloadOnboardingConversationChunks\(/g) ?? []
    ).toHaveLength(3);
  });
});
