import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./chat-tool-schema-strict.js');

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('chat-tool-schema-strict', rule, {
  valid: [
    {
      filename: '/repo/apps/web/lib/chat/tool-schemas.ts',
      code: `const schema = chatToolSchema({ foo: z.string() });`,
    },
    {
      filename: '/repo/apps/web/lib/other/file.ts',
      code: `const schema = z.object({ foo: z.string() });`,
    },
  ],
  invalid: [
    {
      filename: '/repo/apps/web/lib/chat/account-tools.ts',
      code: `tool({ inputSchema: z.object({}), execute: async () => ({}) });`,
      errors: [{ messageId: 'useChatToolSchema' }],
    },
    {
      filename: '/repo/apps/web/app/api/chat/route.ts',
      code: `const createReleaseSchema = z.object({ title: z.string() });`,
      errors: [{ messageId: 'useChatToolSchema' }],
    },
  ],
});
