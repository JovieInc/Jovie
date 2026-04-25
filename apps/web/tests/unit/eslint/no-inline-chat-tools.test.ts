import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import rule from '../../../eslint-rules/no-inline-chat-tools';

describe('no-inline-chat-tools rule', () => {
  it('flags inline tool builders in the main chat route', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          plugins: {
            test: {
              rules: {
                'no-inline-chat-tools': rule,
              },
            },
          },
          rules: {
            'test/no-inline-chat-tools': 'error',
          },
        },
      ],
    });

    const [result] = await eslint.lintText(
      `
        function createAvatarUploadTool() {
          return tool({
            description: 'x',
            execute: async () => ({ success: true }),
          });
        }
      `,
      {
        filePath:
          '/Users/timwhite/conductor/workspaces/jovie-v1/montreal/apps/web/app/api/chat/route.ts',
      }
    );

    expect(result.messages).toHaveLength(2);
  });

  it('ignores tool builders outside the main chat route', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          plugins: {
            test: {
              rules: {
                'no-inline-chat-tools': rule,
              },
            },
          },
          rules: {
            'test/no-inline-chat-tools': 'error',
          },
        },
      ],
    });

    const [result] = await eslint.lintText(
      `
        function createAvatarUploadTool() {
          return tool({
            description: 'x',
            execute: async () => ({ success: true }),
          });
        }
      `,
      {
        filePath:
          '/Users/timwhite/conductor/workspaces/jovie-v1/montreal/apps/web/lib/chat/tools/builders.ts',
      }
    );

    expect(result.messages).toHaveLength(0);
  });
});
