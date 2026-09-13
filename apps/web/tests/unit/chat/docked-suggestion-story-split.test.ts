import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('docked suggestion story split', () => {
  it('keeps ChatInput off OpportunityCard stories so editorial/compact stay loadable', () => {
    const cardStories = readFileSync(
      join(
        ROOT,
        'components/organisms/opportunity-card/OpportunityCard.stories.tsx'
      ),
      'utf8'
    );
    const regionStories = readFileSync(
      join(
        ROOT,
        'components/jovie/components/ChatEmptyStateComposerRegion.stories.tsx'
      ),
      'utf8'
    );
    const elevation = readFileSync(
      join(ROOT, 'tests/e2e/storybook-elevation.spec.ts'),
      'utf8'
    );
    expect(cardStories).not.toContain('ChatInput');
    expect(cardStories).not.toContain('AboveComposer');
    expect(regionStories).not.toContain("from './ChatInput'");
    expect(regionStories).not.toContain('import { ChatInput }');
    expect(regionStories).toContain('export const AboveComposer');
    expect(regionStories).toContain('chat-composer-surface');
    expect(regionStories).toContain('CHAT_COMPOSER_ATTACH_ARIA_LABEL');
    expect(elevation).toContain(
      'chat-emptystate-composerregion--above-composer'
    );
  });
});
