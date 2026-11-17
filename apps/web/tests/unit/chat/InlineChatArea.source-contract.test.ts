import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../../..');

it('keeps inline transcript bubbles on the canonical ChatMessage owner', () => {
  const inlineChatAreaSource = readFileSync(
    resolve(
      appRoot,
      'components/features/dashboard/organisms/InlineChatArea.tsx'
    ),
    'utf8'
  );
  const chatMessageSource = readFileSync(
    resolve(appRoot, 'components/jovie/components/ChatMessage.tsx'),
    'utf8'
  );

  expect(inlineChatAreaSource).toContain('ChatMessage');
  expect(inlineChatAreaSource).not.toContain('const InlineChatMessage');
  expect(inlineChatAreaSource).not.toContain('max-w-[85%]');
  expect(inlineChatAreaSource).not.toContain('rounded-xl px-3 py-2');
  expect(chatMessageSource).toContain('toolVariant');
  expect(chatMessageSource).toContain('showAssistantActions');
});

describe('InlineChatArea virtualized transcript under React Compiler', () => {
  it('opts the virtualizer owner out of memoization (JOV-6702)', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/dashboard/organisms/InlineChatArea.tsx'
      ),
      'utf8'
    );
    const body = source.slice(source.indexOf('export const InlineChatArea'));
    expect(body.slice(0, body.indexOf('useVirtualizer('))).toContain(
      "'use no memo';"
    );
  });
});
