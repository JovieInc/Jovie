import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.'))
      continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:tsx?)$/.test(name) && !/\.(?:test|stories)\./.test(name))
      out.push(path);
  }
  return out;
}

/**
 * Guard (Tim, 2026-10-25): Ovie Home and Jovie's chat home use ONE chat-home
 * state machine and surface, so they cannot drift. Content differs; behavior
 * does not.
 */
describe('chat-home primitive is shared by Ovie and Jovie', () => {
  const chat = read('components/jovie/JovieChat.tsx');

  it('JovieChat, the one chat both apps render, uses the shared primitive', () => {
    expect(chat).toMatch(/from '\.\/chat-home'/);
    for (const symbol of [
      'useChatHomeState',
      'ChatHomeSurface',
      'resolveChatHomeState',
      'CHAT_HOME_SWAP_CLASSNAME',
    ])
      expect(chat, symbol).toContain(symbol);
  });

  it('both apps render JovieChat and nothing else for the chat home', () => {
    for (const client of [
      'app/app/(shell)/chat/ChatPageClient.tsx',
      'app/app/(shell)/admin/chat/OvChatClient.tsx',
    ]) {
      const source = read(client);
      expect(source, client).toMatch(/<JovieChat\b/);
      for (const forbidden of [
        'ChatEmptyStateGreeting',
        'ChatEmptyStateComposerRegion',
        'HomeLoopAnswerPanel',
        'useChatHomeState',
      ])
        expect(source, `${client} must not own ${forbidden}`).not.toContain(
          forbidden
        );
    }
  });

  it('no second implementation: the old Ovie-only state is gone from JovieChat', () => {
    for (const duplicate of [
      'setHomeOpen',
      'transcriptOpen',
      'key={livingCanvas ?',
      "'Escape'",
    ])
      expect(chat, duplicate).not.toContain(duplicate);
  });

  it('only chat-home/ defines the states, the fade and the Esc rule', () => {
    const definers = walk(ROOT)
      .map(path => relative(ROOT, path))
      .filter(file => !file.startsWith('components/jovie/chat-home/'))
      .filter(file => {
        const source = read(file);
        return (
          /data-chat-home-state/.test(source) ||
          /export (?:function|const) (?:resolveChatHomeState|useChatHomeState|ChatHomeSurface)\b/.test(
            source
          )
        );
      });
    expect(definers).toEqual([]);
  });

  it('the primitive owns the rules: three states, Esc on an empty composer, reduced motion', () => {
    const hook = read('components/jovie/chat-home/useChatHomeState.ts');
    const surface = read('components/jovie/chat-home/ChatHomeSurface.tsx');
    expect(hook).toMatch(/'home' \| 'composing' \| 'thread'/);
    expect(hook).toContain("event.key !== 'Escape'");
    expect(hook).toContain('draft.getSnapshot().trim()');
    expect(hook).toContain('motion-reduce:animate-none');
    expect(hook).toContain('motion-reduce:transition-none');
    expect(surface).toContain('inert=');
    expect(surface).toContain('aria-hidden=');
  });
});
