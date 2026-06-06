import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

const actionSourcePaths = [
  'components/jovie/components/ChatLinkConfirmationCard.tsx',
  'components/features/dashboard/organisms/socials-form/SocialLinkSuggestionRows.tsx',
] as const;

const forbiddenCentralActionPatterns = [
  /bg-accent text-accent-foreground/,
  /hover:bg-accent\/90/,
  /text-on-accent/,
  /text-white/,
  /\bbg-(?:blue|purple|violet|indigo)-\d/,
] as const;

describe('chat social add action System B source contract', () => {
  it('keeps chat/social Add actions on neutral primary button tokens', () => {
    for (const sourcePath of actionSourcePaths) {
      const source = readFileSync(resolve(appRoot, sourcePath), 'utf8');

      for (const pattern of forbiddenCentralActionPatterns) {
        expect(source, `${sourcePath} leaked ${pattern}`).not.toMatch(pattern);
      }

      expect(source).toContain('bg-btn-primary');
      expect(source).toContain('text-btn-primary-foreground');
      expect(source).toContain('hover:bg-btn-primary-hover');
    }
  });
});
