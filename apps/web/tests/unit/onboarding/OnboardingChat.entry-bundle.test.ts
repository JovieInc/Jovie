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

  it('loads conversation renderers on demand and warms them when idle', () => {
    expect(source).toMatch(/dynamic\(loadChatMessage\)/);
    expect(source).toMatch(/dynamic\(loadToolPartsRenderer\)/);
    expect(source).toMatch(/scheduleOnboardingConversationPreload\(\)/);
  });
});
