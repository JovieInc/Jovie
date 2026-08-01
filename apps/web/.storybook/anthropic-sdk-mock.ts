/**
 * Browser-safe stub for @anthropic-ai/sdk in Storybook.
 * The real SDK imports node:fs / node:crypto and breaks Vite browser builds.
 */

class Anthropic {
  messages = {
    create: async () => ({
      id: 'sb-mock',
      content: [{ type: 'text', text: '' }],
    }),
  };

  constructor(_opts?: unknown) {}
}

export default Anthropic;
export { Anthropic };
